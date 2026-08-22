# Claim Expiry Invariants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent claim evaluation after `claim_closes_ts` and let any account expire an unresolved policy after that deadline without diverting the holder's refund.

**Architecture:** `evaluate_claim` will reject stale claims before reserve validation, URL validation, web rendering, or model execution. A shared internal expiry transition will preserve the existing holder-only `reclaim_expired` API while powering a new permissionless `expire_stale_claim` API; both release the exact policy reserve, remove the refundable premium from pool accounting, credit only the holder, and assert the liquidity invariant before returning.

**Tech Stack:** Python, GenLayer Python SDK, `u256` atto accounting, `gltest_direct`, pytest, `genvm-lint`, GenLayer CLI.

## Global Constraints

- Use English ASCII only in source code, comments, tests, schemas, configuration, and documentation.
- Maintain Checks-Effects-Interactions ordering.
- Preserve `total_pool_balance_atto >= reserved_atto + unreserved_available_atto` at every completed money transition.
- Keep the pinned `py-genlayer` runner hash on line 1 of the contract.
- Do not create a git commit unless the user explicitly requests one.
- Do not leave `.pytest_cache`, `__pycache__`, `.pyc`, `.DS_Store`, or generated artifact directories in the repository.

---

### Task 1: Regression Tests

**Files:**
- Modify: `tests/direct/test_parametric_insurance.py`
- Modify: `tests/direct/test_contract_source_boundary.py`
- Modify: `tests/integration/test_parametric_insurance_integration.py`

**Interfaces:**
- Consumes: `evaluate_claim(policy_id: int) -> str`, `get_policy(policy_id: int) -> dict`, `get_stats() -> dict`, `claimable_of(account: str) -> str`.
- Produces: expected public method `expire_stale_claim(policy_id: int) -> None` and repository-wide ASCII enforcement.

- [ ] **Step 1: Add a failing late-evaluation test**

Create a submitted claim inside the window, warp to `claim_closes_ts + 1`, prime a maximum-payout evaluation, call `evaluate_claim`, and require `[EXPECTED] Claim window closed`. Assert the status stays `CLAIM_SUBMITTED`, the policy and aggregate reserve locks remain unchanged, no refund or payout is credited, and no native transfer is emitted.

- [ ] **Step 2: Add strict boundary coverage**

Evaluate exactly at `claim_closes_ts` and assert the evaluation is still allowed. This proves the rejection condition is strictly `now > claim_closes_ts`, not `>=`.

- [ ] **Step 3: Add permissionless expiration tests**

For both `ACTIVE` and `CLAIM_SUBMITTED`, call `expire_stale_claim` from an arbitrary account after the close. Assert:

```python
assert after_reserved == before_reserved - locked
assert after_unreserved == before_unreserved + locked - premium
assert after_total == before_total - premium
assert contract.claimable_of(holder_hex) == str(premium)
assert contract.claimable_of(caller_hex) == "0"
assert after_total >= after_reserved + after_unreserved
```

Also prove expiration is blocked at the exact closing instant and cannot be repeated on a terminal policy.

- [ ] **Step 4: Add an ASCII repository guard**

Scan tracked source and documentation file types as bytes and fail if any byte is greater than `0x7f`. Keep the runtime homoglyph URL test by spelling the character with an ASCII `\u` escape in Python source.

- [ ] **Step 5: Run the focused tests and confirm they fail for the missing behavior**

Run:

```bash
pytest -v tests/direct/test_parametric_insurance.py -k "evaluate_after_claim_closes or evaluate_at_claim_closes or expire_stale_claim"
```

Expected before implementation: the late evaluation settles instead of reverting and `expire_stale_claim` is absent.

---

### Task 2: Contract Transition

**Files:**
- Modify: `contracts/parametric_insurance.py`

**Interfaces:**
- Consumes: `Policy`, `_now_ts`, `_require_policy_reserve_lock`, `_release_reserve`, `_remove_unreserved_liquidity`, `_credit`, `_assert_liquidity_invariant`.
- Produces: `expire_stale_claim(policy_id: int) -> None` and `_expire_policy(policy: Policy) -> None`.

- [ ] **Step 1: Enforce the evaluation deadline**

Immediately after requiring `CLAIM_SUBMITTED`, reject stale evaluation before any reserve, source, web, or model operation:

```python
if _now_ts() > int(policy.claim_closes_ts):
    raise gl.vm.UserError(f"{ERROR_EXPECTED} Claim window closed")
```

- [ ] **Step 2: Add the permissionless public entry point**

```python
@gl.public.write
def expire_stale_claim(self, policy_id: int) -> None:
    policy = self._require_policy(policy_id)
    self._expire_policy(policy)
```

Do not inspect or credit `gl.message.sender_address` in this path.

- [ ] **Step 3: Centralize expiration effects**

Move the common transition into `_expire_policy`. It must check unresolved status, require `now > claim_closes_ts`, validate the full policy reserve lock, release that lock, debit the premium from total and unreserved pool accounting, credit the premium to `policy.holder`, mark `EXPIRED`, increment `count_expired`, and assert the liquidity invariant. There is no external interaction in this transition.

- [ ] **Step 4: Preserve the existing holder API**

Keep `reclaim_expired` as a holder-gated compatibility entry point, then delegate to `_expire_policy` so both APIs have exactly the same accounting and terminal state.

- [ ] **Step 5: Remove the embedded deployment address**

Delete the unused `DEPLOYED_CONTRACT_ADDRESS` source constant. A source file containing its own future deployment address cannot remain byte-for-byte identical to the source actually deployed; deployment metadata belongs in `deployments/studionet.json` and the README.

---

### Task 3: Interface And Documentation

**Files:**
- Modify: `contracts/parametric_insurance.schema.json`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `.claude/settings.local.json` if needed for the ASCII invariant

**Interfaces:**
- Consumes: final contract public ABI and accounting behavior.
- Produces: an ASCII-only schema and documentation that describe the exact deployed implementation.

- [ ] **Step 1: Update the schema**

Document the evaluation close gate, add `expire_stale_claim`, retain holder-only `reclaim_expired`, and include both cleanup methods plus `evaluate_claim` in the coverage timeline enforcement list.

- [ ] **Step 2: Update lifecycle and accounting documentation**

Document that expiration is permissionless but the premium refund is always credited to the holder. Show the exact transition:

```text
total      -= premium
reserved   -= locked_reserve
unreserved += locked_reserve - premium
claimable[holder] += premium
```

- [ ] **Step 3: Convert repository text to English ASCII**

Replace typographic punctuation, symbols, box drawings, emoji, and literal homoglyphs with ASCII equivalents or escaped test literals. Remove stale deployment claims instead of carrying conflicting legacy metadata forward.

---

### Task 4: Verification And Deployment

**Files:**
- Modify after deployment: `deployments/studionet.json`
- Modify after deployment: `README.md`

**Interfaces:**
- Consumes: lint-clean, test-clean final contract source.
- Produces: a live StudioNet address whose retrieved source and ABI match the repository.

- [ ] **Step 1: Run contract validation before tests**

Run:

```bash
genvm-lint check contracts/parametric_insurance.py
genvm-lint typecheck contracts/parametric_insurance.py
```

Expected: lint and semantic validation pass; Pyright reports no type errors.

- [ ] **Step 2: Run the complete requested test command**

Run `pytest -v` and require zero failures.

- [ ] **Step 3: Deploy the unchanged final contract source**

With the active `studionet` network and unlocked account, run:

```bash
genlayer deploy --contract contracts/parametric_insurance.py
```

Inspect the receipt execution result, not only its lifecycle status.

- [ ] **Step 4: Verify deployed source and ABI**

Run `genlayer code <address>` and `genlayer schema <address>`. Confirm the source contains the deadline check and `expire_stale_claim`, and that the schema exposes 18 methods: 8 views and 10 writes.

- [ ] **Step 5: Update deployment metadata without changing contract source**

Record the address, explorer URL, deployment transaction, method counts, source-match status, and behavior summary in `deployments/studionet.json` and `README.md`.

- [ ] **Step 6: Re-run final verification and clean generated files**

Run the two linter commands and `pytest -v` again after all repository edits. Remove ignored cache and artifact files, run the ASCII byte scan, inspect `git diff`, and ensure only intended files remain modified.
