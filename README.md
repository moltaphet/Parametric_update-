# Parametric Web Insurance

> Autonomous flight-delay insurance settled from live web evidence by GenLayer
> validator consensus, with no claims adjuster and no discretionary review.

`ParametricInsurance` is a GenLayer Intelligent Contract. A policyholder buys
coverage before a flight. If the flight is delayed, they cite an allowlisted
flight-status page. GenLayer validators then independently render that page,
extract the delay, and must agree on a payout tier before any money moves.
Settlement is an exact-wei native transfer; a claim that cannot be confirmed
refunds the premium instead.

[![Contract](https://img.shields.io/badge/StudioNet-0x8Ed1...D896-22d3ee)](https://genlayer-explorer.vercel.app/address/0x8Ed11A2C8bae3584110FecF9D7Ac3325ca2aD896)
[![Tests](https://img.shields.io/badge/tests-120%20passing-34d399)](tests/direct)
[![License](https://img.shields.io/badge/license-MIT-94a3b8)](LICENSE)

---

## Table of contents

- [Deployment](#deployment)
- [Architecture](#architecture)
- [How the insurance works](#how-the-insurance-works)
- [Consensus rules](#consensus-rules)
- [Source trust model](#source-trust-model)
- [Settlement and liquidity](#settlement-and-liquidity)
- [Pool capital and withdrawal rights](#pool-capital-and-withdrawal-rights)
- [Public API](#public-api)
- [Running the tests](#running-the-tests)
- [Running the frontend](#running-the-frontend)
- [Funding an account and seeding the pool](#funding-an-account-and-seeding-the-pool)
- [Known issues](#known-issues)
- [Project layout](#project-layout)

---

## Deployment

| Field | Value |
|-------|-------|
| Network | StudioNet (gasless) |
| Address | [`0x8Ed11A2C8bae3584110FecF9D7Ac3325ca2aD896`](https://genlayer-explorer.vercel.app/address/0x8Ed11A2C8bae3584110FecF9D7Ac3325ca2aD896) |
| Interface | 18 methods (8 view, 10 write) |
| Source match | Verified byte-for-byte against `contracts/parametric_insurance.py` |
| Status | Live and exercised end to end: pool funded, policies created through the UI under full consensus |

[`deployments/studionet.json`](deployments/studionet.json) is the canonical
deployment record and the single source of truth for the address, explorer URL,
method counts, and verification status.

The deployment has been driven end to end from `web/`: `fund_pool` and
`create_policy` both settled through `ACCEPTED` and `FINALIZED`, with reserves
locked at exactly `premium * 12` and the liquidity invariant holding after each
write. See [Funding an account and seeding the pool](#funding-an-account-and-seeding-the-pool)
to reproduce it.

> **Note on ownership.** The `owner` recorded on-chain is
> `0x1f9813eeB2de53134af5C824cA156CE82C4EB0fa`. Owner-only methods
> (`withdraw_unreserved_liquidity`, `add_trusted_domain`,
> `remove_trusted_domain`) require that key. `fund_pool` is permissionless, so
> seeding liquidity does not.

The contract source contains no hard-coded address. That is deliberate: it keeps
the repository source byte-for-byte deployable and lets the on-chain source
retrieved with `genlayer code` match this repository exactly.

```bash
genlayer network set studionet
C=0x8Ed11A2C8bae3584110FecF9D7Ac3325ca2aD896

genlayer code   "$C"        # retrieve deployed source
genlayer schema "$C"        # retrieve the ABI
genlayer call   "$C" get_coverage_terms
genlayer call   "$C" get_stats
```

StudioNet is gasless, so a zero GEN balance does not prevent deployment or
transactions.

---

## Architecture

Three parties, with a deliberately narrow contract boundary:

```text
+------------------+        +---------------------------+        +-------------------+
|  Client          |        |  ParametricInsurance      |        |  Allowlisted      |
|  (web/, frontend/)|  -->  |  (GenLayer contract)      |  -->   |  status providers |
|                  |        |                           |        |                   |
| - wallet session |        | - underwriting            |        | - raw evidence    |
| - tx submission  |        | - policy state machine    |        |   (HTML pages)    |
| - previews       |        | - source allowlist        |        |                   |
|   (advisory only)|        | - consensus evaluation    |        |                   |
|                  |        | - reserve accounting      |        |                   |
|                  |        | - settlement / expiry     |        |                   |
+------------------+        +---------------------------+        +-------------------+
```

- The **client** owns presentation, transaction submission, and non-authoritative
  previews. It never supplies a verdict.
- The **contract** owns every decision that moves money.
- **Providers** own the raw evidence. Validators fetch and interpret it
  independently rather than trusting any submitted result.

The contract is a single file, [`contracts/parametric_insurance.py`](contracts/parametric_insurance.py).
A deeper design document lives in [`docs/architecture.md`](docs/architecture.md).

### Policy state machine

```text
ACTIVE ---------- submit_claim -------> CLAIM_SUBMITTED   (inside claim window)
ACTIVE ---------- reclaim_expired ----> EXPIRED           (holder, after close)
ACTIVE ---------- expire_stale_claim -> EXPIRED           (any caller, after close)

CLAIM_SUBMITTED -- evaluate_claim ----> SETTLED_PAID      (delay >= threshold)
CLAIM_SUBMITTED -- evaluate_claim ----> REJECTED          (delay <  threshold)
CLAIM_SUBMITTED -- evaluate_claim ----> FAILED            (flight not on source)
CLAIM_SUBMITTED -- reclaim_expired ---> EXPIRED           (holder, after close)
CLAIM_SUBMITTED -- expire_stale_claim-> EXPIRED           (any caller, after close)
```

| State | Meaning | Money |
|-------|---------|-------|
| `ACTIVE` | Coverage is in force. | Premium in pool; `premium * 12` reserved. |
| `CLAIM_SUBMITTED` | A trusted source URL was cited in the claim window. | Reserve stays locked. |
| `SETTLED_PAID` | Consensus confirmed a qualifying delay or cancellation. | Tier payout transferred natively. |
| `REJECTED` | Consensus observed a delay below threshold. | Premium stays in the pool. |
| `FAILED` | The flight was not present on the source. | Premium queued for the holder. |
| `EXPIRED` | Unresolved policy cleaned up after the deadline. | Premium queued for the holder. |

---

## How the insurance works

Parametric insurance pays on a measured parameter, not on an assessed loss.
There is no adjuster and nothing to negotiate: either the observed delay crosses
the threshold or it does not.

**1. Buy.** The holder calls `create_policy(flight_number, departure_time,
delay_threshold_mins)` and sends the premium as call value. The contract locks
`premium * 12` from the pool as worst-case exposure, so the policy is fully
collateralized from the moment it exists.

**2. Wait.** Coverage is in force. The claim window is computed from the
departure time and stored on the policy.

**3. Claim.** After departure, the holder calls `submit_claim(policy_id, url)`
naming an allowlisted flight-status page.

**4. Settle.** Anyone may call `evaluate_claim(policy_id)`. Validators reach
consensus on a verdict and tier, and the contract pays, rejects, or refunds.

### Coverage timeline

Every bound is derived from the scheduled departure. No caller supplies, widens,
or skips a deadline.

```text
created ......... cutoff ......... departure ......... claim closes
|<-- buying OK -->|<-- refused -->|<-- claim + evaluate -->|<-- expire
                  24h before                7 days after
```

| Constant | Value | Enforcement |
|----------|-------|-------------|
| `COVERAGE_CUTOFF_SECONDS` | 24 hours | A policy must be created at least 24h before departure. |
| `CLAIM_WINDOW_SECONDS` | 7 days | Submission and evaluation allowed on `[departure, claim_closes_ts]`, inclusive. |
| `MAX_ADVANCE_SECONDS` | 1 year | Caps how long capital can be reserved in advance. |

Why the cutoff exists: inside 24 hours a delay is frequently already announced,
so selling coverage there is underwriting a known loss rather than a risk.

Boundary behavior is explicit:

- At exactly `claim_closes_ts` a submitted claim may still be evaluated.
- When `now > claim_closes_ts`, `evaluate_claim` raises
  `[EXPECTED] Claim window closed` before any reserve check, URL handling, web
  render, or model call.
- `reclaim_expired` and `expire_stale_claim` reject at the exact closing instant
  and unlock only when `now > claim_closes_ts`.

`get_coverage_terms()` returns the compiled-in rules and
`check_coverage_eligibility()` dry-runs the purchase cutoff, so a buyer can
confirm eligibility before spending gas.

### Payout tiers

| Tier | Trigger | Payout |
|------|---------|--------|
| 0 | `delay < threshold` | none (`REJECTED`) |
| 1 | `threshold <= delay < 3 * threshold` | `premium * 5` |
| 2 | `delay >= 3 * threshold`, or cancellation | `premium * 12` |

---

## Consensus rules

This is the part that makes the contract an Intelligent Contract rather than a
conventional one.

`evaluate_claim()` performs all deterministic checks first (state, deadline,
reserve integrity, source trust) and only then enters
`gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`.

The leader path:

1. Renders the allowlisted status page with `gl.nondet.web.render`.
2. Caps content at 20,000 characters.
3. Wraps the untrusted page text in a dynamic SHA-256 fence.
4. Extracts structured JSON with `gl.nondet.exec_prompt`.
5. Deterministically derives `(verdict, tier, delay)`.

Validators repeat the observation independently and must agree on the
**`(verdict, tier)` pair**. They deliberately do not compare raw page bytes,
free-form model prose, or the exact delay figure. Comparing the decision rather
than the observation is what lets the contract tolerate benign variance (one
validator reading 90 minutes and another 95) while still requiring exact
agreement on the state transition and the amount paid.

### Time is deterministic

`datetime.now()` inside GenVM is pinned to the transaction timestamp, so every
validator re-executing a transaction observes the same instant. All timeline
arithmetic in the contract relies on this and is consensus-safe.

### Error taxonomy

Failures are classified so validators can compare them, which keeps the contract
fail-closed: a claim never settles on ambiguous or broken data.

| Prefix | Meaning | Validator rule |
|--------|---------|----------------|
| `[EXPECTED]` | Deterministic business, auth, timeline, or accounting error. | Exact message match. |
| `[EXTERNAL]` | Deterministic source failure or flight-not-found. | Exact match. |
| `[TRANSIENT]` | Network, 5xx, or blank render. | Agree only if both are transient. |
| `[LLM_ERROR]` | Malformed or invalid model output. | Always disagree; rotate validators. |

Transient and model failures revert and leave the claim retryable while the
window is open. After it closes, evaluation is disabled and either expiry path
releases the reserve and queues the holder's refund.

---

## Source trust model

The beneficiary chooses *which* trusted provider to cite, never *whether* a
provider is trusted.

Core providers are compiled into the contract and are permanently immutable. No
caller, not even the owner, can remove one:

- `flightradar24.com`
- `flightaware.com`
- `flightstats.com`

The owner may add or remove additional providers. URLs must use `https`, and the
host must match a trusted domain exactly or be a genuine subdomain of one.

Strict hand-rolled parsing rejects the standard allowlist bypasses: suffix-label
spoofs (`flightaware.com.evil.com`), userinfo tricks (`...@evil.com`), query,
path and fragment tricks, percent-encoded hosts, WHATWG backslash authority
splits, control characters, IP literals, and non-registrable hosts.

The gate runs twice: at `submit_claim` and again inside `evaluate_claim` before
any web or model work. Revoking a provider therefore also blocks a claim that
was already submitted against it.

---

## Settlement and liquidity

All amounts are wei (atto-scale, `1 GEN = 10^18 wei`) held as `u256`, so payouts
are exact and safe for cross-chain interop.

Each policy locks its worst-case `premium * 12` exposure at purchase. The
required solvency invariant is:

```text
total_pool_balance_atto >= reserved_atto + unreserved_available_atto
```

Current accounting preserves equality, which is strictly stronger. For either
expiry path the exact transition is:

```text
total_pool_balance_atto     -= premium
reserved_atto               -= locked_reserve
unreserved_available_atto   += locked_reserve - premium
claimable[policy.holder]    += premium
```

Expiration performs no external call. Paid settlement commits all state and
validates solvency before emitting the native transfer, and `withdraw()` zeroes
the queued refund before emitting its transfer. Both follow
Checks-Effects-Interactions. A permissionless cleanup caller is never credited;
the refund always goes to the policy holder.

---

## Pool capital and withdrawal rights

**Read this before sending value to the contract.** Funding and withdrawal are
deliberately asymmetric.

- **`fund_pool()` is open to any account.** There is no allowlist on who may add
  payout capacity.
- **`withdraw_unreserved_liquidity()` is owner-only.** Only the `owner` set at
  construction (the insurer) can remove pool capital, and only up to
  `unreserved_available_atto`.

**A third-party funder has no withdrawal path.** Capital sent via `fund_pool()`
becomes pool liquidity recoverable only by the owner. This is intentional: the
pool is the insurer's underwriting capital, not a redeemable deposit. There is no
LP token, no pro-rata share, and no refund path for funders. Do not send value to
`fund_pool()` expecting to withdraw it.

Two properties bound what the owner can do:

- The withdrawal cap is `unreserved_available_atto`, and `reserved_atto` is the
  sum of every unresolved policy's worst-case exposure. The owner therefore
  cannot touch capital backing a live policy. A policyholder's maximum-tier
  payout stays covered even if the owner drains everything else.
- Queued refunds in `claimable` sit outside pool accounting. `FAILED` and
  `EXPIRED` remove the premium from the pool at the moment they credit the
  holder, so an owner withdrawal can never consume a refund already owed.

Ownership is fixed at construction; there is no transfer or renounce path. Loss
of the owner key permanently freezes extra-provider governance and leaves
unreserved liquidity unrecoverable. Core domains stay immutable and settlement
stays permissionless, so policies continue to work.

---

## Public API

18 public methods: 8 views, 10 writes. The machine-readable interface is
[`contracts/parametric_insurance.schema.json`](contracts/parametric_insurance.schema.json).

### Writes

| Method | Access | Effect |
|--------|--------|--------|
| `fund_pool()` | anyone, payable | Add unreserved payout capacity. Owner-only to withdraw. |
| `create_policy(flight_number, departure_time, delay_threshold_mins)` | anyone, payable | Create `ACTIVE` coverage; lock worst-case exposure. |
| `submit_claim(policy_id, flight_status_url)` | holder | `ACTIVE` to `CLAIM_SUBMITTED`, inside the claim window. |
| `evaluate_claim(policy_id)` | anyone | Run consensus evaluation and settle. |
| `reclaim_expired(policy_id)` | holder | Post-deadline expiry. |
| `expire_stale_claim(policy_id)` | anyone | Permissionless cleanup; refund always to holder. |
| `withdraw()` | anyone | Transfer the caller's queued refunds (CEI). |
| `withdraw_unreserved_liquidity(amount_atto)` | owner | Withdraw idle capital, capped at unreserved. |
| `add_trusted_domain(domain)` | owner | Allowlist an extra provider. |
| `remove_trusted_domain(domain)` | owner | Revoke an extra provider; core is immutable. |

### Views

| Method | Returns |
|--------|---------|
| `get_policy(policy_id)` | Full policy record. |
| `get_claim_verdict(policy_id)` | Settlement status and payout detail. |
| `claimable_of(account)` | Queued refund balance. |
| `get_coverage_terms()` | Compiled-in timeline and enforcement points. |
| `check_coverage_eligibility(departure_time)` | Dry-run of the purchase cutoff. |
| `is_trusted_url(url)` | Dry-run of the source allowlist gate. |
| `get_trust_model()` | Allowlist governance and enforcement detail. |
| `get_stats()` | Counters, liquidity terms, and invariant status. |

---

## Running the tests

Install the pinned toolchain first. Versions in
[`requirements.txt`](requirements.txt) are exactly those used to produce the
result below.

```bash
python -m pip install -r requirements.txt
```

### Validation and unit tests

```bash
genvm-lint check     contracts/parametric_insurance.py   # AST safety + ABI validation
genvm-lint typecheck contracts/parametric_insurance.py   # SDK-aware type checking
pytest -v                                                # 120 direct-mode tests
```

`pytest.ini` sets `testpaths = tests/direct`, so a bare `pytest` runs the
in-memory suite only and needs no network access. It covers the full state
machine, accounting invariants, timeline boundaries, the source allowlist,
adversarial URL parsing, prompt-injection resistance, the repository source
boundary, and an ASCII-only boundary.

Direct mode uses a warped clock and mocked web/model responses, which is what
makes post-deadline behavior testable at all.

### Integration tests (real consensus)

```bash
gltest tests/integration/ -v -s --network studionet
```

These deploy to StudioNet and exercise leader plus validator consensus on every
write. StudioNet has no time warp and the contract refuses to insure a flight
less than 24h out, so a policy created during a run cannot reach its claim
window. Integration therefore covers deployment, purchase-time boundaries,
pre-window claim rejection, pre-deadline cleanup rejection, liquidity reads, and
allowlist enforcement. Post-deadline paths stay covered in direct mode.

### Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs validation and the
direct suite on every push and pull request. The StudioNet integration suite is a
manual `workflow_dispatch` job rather than a per-commit gate, because StudioNet
is shared and rate-limited.

---

## Running the frontend

There are two clients. **`web/` is the current one.**

### web/ - Next.js (current)

Next.js App Router, Tailwind v4, Framer Motion, and React Three Fiber, with an
interactive 3D landing page.

```bash
cd web
cp .env.example .env.local
npm install
npm run dev            # http://localhost:3000
```

```bash
npm run typecheck
npm run build
```

Do not run `npm run build` while `npm run dev` is live. Both write to `.next`,
and the build replaces assets the dev server is still serving, leaving the page
unstyled until the dev server restarts.

Implemented: 3D landing page, wallet connect/disconnect (session and injected
connectors), policy purchase, pool funding, and policy tracking. Claim
submission and evaluation are not yet wired into `web/`; `frontend/` has working
implementations to port. See [`web/README.md`](web/README.md) for the component
map, design-system tokens, and wallet/transaction notes.

### frontend/ - Vite (legacy)

The original React + Vite client. Feature-complete for the dashboard flow and
retained as the reference implementation for the claim path until `web/` reaches
parity.

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Neither client has a committed test suite. Adding Vitest plus React Testing
Library over `web/src/lib` and `web/src/hooks`, and an `npm ci && npm run build`
job in CI, is the recommended next step.

### Funding an account and seeding the pool

Both are required before a policy can be bought, and neither is obvious.

**1. The contract fully collateralizes every policy.** `create_policy` locks
`premium * 12` and refuses the sale unless the pool already covers it:

```text
unreserved_available + premium >= premium * 12   =>   premium <= unreserved / 11
```

An unfunded pool therefore rejects every purchase. `web/` checks this
client-side and blocks submission rather than letting you discover it as a
revert after waiting through consensus.

**2. StudioNet is gasless for gas, not for value.** `fund_pool` and
`create_policy` are payable, so the signing account needs a real balance. A
fresh session wallet starts at zero.

Fund an account with the StudioNet faucet. Note the amount is in **wei**:

```bash
ADDR=0xYourAccountAddress
curl -s -X POST https://studio.genlayer.com/api \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"sim_fundAccount\",
       \"params\":{\"account_address\":\"$ADDR\",\"amount\":200000000000000000000}}"
```

Then seed the pool from the dashboard's underwriting panel, or directly:

```bash
genlayer write 0x8Ed11A2C8bae3584110FecF9D7Ac3325ca2aD896 fund_pool --value 120000000000000000000
```

Seeding 120 GEN supports policies up to a ~10.9 GEN premium. Remember that only
the contract owner can withdraw pool liquidity - see
[Pool capital and withdrawal rights](#pool-capital-and-withdrawal-rights).

---

## Known issues

Recorded from an internal audit. The contract is frozen at the approved, deployed
revision, so these are documented rather than patched.

**Prompt fence token is derivable from page content (open).** `_fence_token()` is
a pure function of the scraped text, so a party who controls that text can
recompute the token offline, emit a matching `<<<END:TOKEN>>>` marker, and append
instructions into the trusted region of the extraction prompt. The docstring's
claim that a page author "cannot predict it" does not hold.

Reachability is narrow but real: `submit_claim` validates only the URL *host*, so
the holder freely chooses path and query on an allowlisted domain. A page on a
trusted origin that reflects attacker-supplied input into rendered text supplies
the needed control, and the holder is the party who profits from a forged
maximum-tier payout.

Mitigating factors: the origin must already be allowlisted, validators must
independently agree on `(verdict, tier)`, and every payout is capped at the
policy's `premium * 12` reserve lock.

The fix does not require the token to be secret, which is unachievable. It
requires the marker to be unrepresentable: collapse `<<<` and `>>>` runs in the
untrusted text before building the prompt. This is a contract change and is
deferred to the next deployment.

---

## Project layout

```text
.github/workflows/
  ci.yml                        validation + direct tests; manual integration job
contracts/
  parametric_insurance.py       the intelligent contract (single source file)
  parametric_insurance.schema.json
deployments/
  studionet.json                canonical deployment record
docs/
  architecture.md               design document
frontend/                       Vite client (legacy, feature-complete dashboard)
tests/direct/
  test_parametric_insurance.py  state machine, accounting, boundaries, allowlist
  test_contract_source_boundary.py
tests/integration/
  test_parametric_insurance_integration.py
web/                            Next.js client (current, 3D landing page)
LICENSE                         MIT
requirements.txt                pinned Python toolchain
gltest.config.yaml
pytest.ini
```

Two repository invariants are enforced by tests rather than convention:

- Every Python file is either real contract source under `contracts/` or a
  pytest module named `test_*.py`, so GenVM's contract detector can never
  misidentify a helper module as contract source.
- All source and documentation is ASCII-only.

---

## License

[MIT](LICENSE).

Not a regulated insurance product. Provided as-is for evaluation on a test
network.
