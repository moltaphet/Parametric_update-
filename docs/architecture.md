# Architecture - Parametric Web Insurance

`ParametricInsurance` uses GenLayer consensus to underwrite and settle
flight-delay insurance from live web data. Confirmed claims use exact-wei native
payouts; failed or expired policies use deferred premium refunds.

## 1. Contract Boundary

- The client owns the user interface, transaction submission, indexing, and
  non-authoritative previews.
- The GenLayer contract owns underwriting, policy state, source allowlisting,
  consensus evaluation, reserve accounting, settlement, and expiration.
- Allowlisted flight-status providers own the raw evidence. Validators fetch and
  interpret that evidence independently rather than trusting a client result.

## 2. State Machine

```text
ACTIVE -------- submit_claim -------> CLAIM_SUBMITTED  (inside claim window)
ACTIVE -------- reclaim_expired ----> EXPIRED          (holder, after close)
ACTIVE -------- expire_stale_claim -> EXPIRED          (any caller, after close)

CLAIM_SUBMITTED -- evaluate_claim --> SETTLED_PAID     (before/at close)
CLAIM_SUBMITTED -- evaluate_claim --> REJECTED         (before/at close)
CLAIM_SUBMITTED -- evaluate_claim --> FAILED           (before/at close)
CLAIM_SUBMITTED -- reclaim_expired -> EXPIRED          (holder, after close)
CLAIM_SUBMITTED -- expire_stale_claim -> EXPIRED       (any caller, after close)
```

Every transition validates the current state and raises a classified
`gl.vm.UserError` when a precondition fails. Evaluation is permissionless, but
it rejects `now > claim_closes_ts` before reserve validation, URL handling, web
rendering, or model execution. Evaluation at exactly `claim_closes_ts` remains
valid.

## 3. Coverage Timeline

The contract derives every time bound from the scheduled departure:

```text
created ......... cutoff ......... departure ......... claim closes
|<-- buying OK -->|<-- refused -->|<-- submit/evaluate allowed -->|<-- expire
                  24h before                 7 days after
```

| Constant | Value | Enforcement |
|----------|-------|-------------|
| `COVERAGE_CUTOFF_SECONDS` | 24 hours | `create_policy` requires departure to be at least 24 hours away. |
| `CLAIM_WINDOW_SECONDS` | 7 days | `submit_claim` and `evaluate_claim` allow the inclusive interval `[departure, claim_closes_ts]`; cleanup requires `now > claim_closes_ts`. |
| `MAX_ADVANCE_SECONDS` | 1 year | `create_policy` bounds how long capital may be reserved. |

`get_coverage_terms()` exposes these compiled-in rules, and
`check_coverage_eligibility()` mirrors the purchase-time cutoff for auditing.

## 4. Money Model

All money uses atto-scale `u256` values (`1 GEN = 10**18 wei`). The contract
tracks:

- `total_pool_balance_atto`: liquidity still assigned to the insurance pool.
- `reserved_atto`: sum of unresolved policies' worst-case reserve locks.
- `unreserved_available_atto`: pool liquidity not backing a policy.
- `locked_reserve_atto`: one policy's exact worst-case reserve lock.
- `claimable[address]`: queued `FAILED` or `EXPIRED` premium refunds.
- `pool_balance_atto` and `available_atto`: synchronized compatibility aliases.

The required invariant is:

```text
total_pool_balance_atto >= reserved_atto + unreserved_available_atto
```

Current transitions preserve equality, which is stronger than the required
solvency inequality.

Let `e = premium * 12` be the policy lock, `p <= e` a confirmed payout, and `q`
the premium:

| Transition | total | reserved | unreserved | claimable | native transfer |
|------------|-------|----------|------------|-----------|-----------------|
| `fund_pool(a)` | `+a` | `0` | `+a` | `0` | none |
| `create_policy` | `+q` | `+e` | `+(q-e)` | `0` | none |
| `SETTLED_PAID` | `-p` | `-e` | `+(e-p)` | `0` | `p` to holder |
| `REJECTED` | `0` | `-e` | `+e` | `0` | none |
| `FAILED` or `EXPIRED` | `-q` | `-e` | `+(e-q)` | `+q` to holder | none |
| refund `withdraw` | `0` | `0` | `0` | `-a` | `a` to holder |
| owner withdrawal | `-a` | `0` | `-a` | `0` | `a` to owner |

For permissionless expiration, the exact accounting is:

```text
total_pool_balance_atto -= premium
reserved_atto -= locked_reserve
unreserved_available_atto += locked_reserve - premium
claimable[policy.holder] += premium
```

The cleanup caller is only a liveness agent and never receives the refund.

## 5. Expiration And CEI

`reclaim_expired()` remains holder-only for API compatibility.
`expire_stale_claim()` allows any account to clean up an unresolved `ACTIVE` or
`CLAIM_SUBMITTED` policy after the deadline. Both delegate to `_expire_policy()`
so status checks, deadline checks, reserve validation, accounting, and terminal
state are identical.

Expiration makes no external call. It validates the full policy lock, releases
the reserve, removes the premium from pool accounting, credits the holder, sets
`EXPIRED`, increments the expiration counter, and verifies liquidity.

Paid settlement follows Checks-Effects-Interactions: `evaluate_claim()` commits
state and checks liquidity before emitting the native payout. Refund withdrawal
zeros `claimable` and checks liquidity before emitting its transfer.

## 6. Consensus Evaluation

After deterministic state, deadline, reserve, and source checks,
`evaluate_claim()` calls `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`:

1. `leader_fn` renders the allowlisted URL with `gl.nondet.web.render`.
2. Rendered content is capped and wrapped in a dynamic SHA-256 fence.
3. `gl.nondet.exec_prompt(..., response_format="json")` extracts `found`,
   `cancelled`, and `delay_minutes`.
4. Deterministic code derives a `(verdict, tier, delay)` decision.
5. Validators repeat the observation and require the same `(verdict, tier)`.

The contract compares stable decision fields rather than raw page or model
output. This tolerates irrelevant page variance while requiring agreement on the
state transition and payout tier.

## 7. Source Trust

The policy holder may cite only an `https` URL whose parsed host is an immutable
core domain or an owner-governed extra domain. The gate uses exact or genuine
subdomain matching and rejects suffix-label spoofs, userinfo, backslashes,
percent-encoded hosts, IP literals, control characters, and non-registrable
hosts.

The contract checks the source at submission and again during evaluation. The
second check happens before web or model work, so a provider revoked after
submission cannot settle.

## 8. Error Taxonomy

| Prefix | Source | Validator handling |
|--------|--------|--------------------|
| `[EXPECTED]` | Deterministic business rules | Exact message match. |
| `[EXTERNAL]` | Deterministic external 4xx or flight-not-found classification | Exact match. |
| `[TRANSIENT]` | Network, 5xx, or blank render | Agree only when both validators see transient failure. |
| `[LLM_ERROR]` | Malformed or invalid model output | Disagree and rotate validators. |

Transient and model failures revert, leaving the claim retryable until the
deadline. After the deadline, evaluation is disabled and either expiration path
can release the reserve and queue the holder's refund.

## 9. Verification

1. Run `genvm-lint check contracts/parametric_insurance.py` for AST safety and
   ABI validation.
2. Run `genvm-lint typecheck contracts/parametric_insurance.py` for SDK-aware
   type checking.
3. Run `pytest -v` for direct state-machine, accounting, boundary, source, and
   repository-source tests.
4. Run `gltest tests/integration/ -v -s --network studionet` for deployment and
   real-consensus boundary checks.

Direct tests use a warped clock to prove the exact close boundary, stale
evaluation rejection, permissionless cleanup for both unresolved states,
single-use terminal behavior, reserve restoration, refund ownership, and no
native transfer during expiration.

StudioNet has no time warp. A policy created during an integration run cannot
reach a claim window that starts at least 24 hours later, so live tests cover
deployment, purchase-time boundaries, pre-window rejection, pre-deadline cleanup
rejection, and allowlist behavior. Direct tests cover post-deadline settlement
and cleanup with deterministic time travel.
