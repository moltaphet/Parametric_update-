# Parametric Web Insurance - GenLayer Intelligent Contract

> Autonomous flight-delay insurance settled from live web evidence by validator
> consensus, without a privileged claims adjuster.

`ParametricInsurance` underwrites a policy before a flight, accepts a claim in a
bounded post-departure window, and asks GenLayer validators to independently
render an allowlisted flight-status page. Validators agree on a payout tier,
then the contract either transfers an exact-wei native payout or queues a premium
refund.

The contract also enforces claim liveness: evaluation stops after the evidence
deadline, while any account may release an unresolved policy's reserve after the
deadline. Permissionless cleanup always refunds the policy holder, never the
cleanup caller.

## Deployment

The source-matched StudioNet deployment is recorded in
[`deployments/studionet.json`](deployments/studionet.json). That file is the
canonical location for the current address, explorer URL, method counts, and
source-verification status.

- Address: [`0x8Ed11A2C8bae3584110FecF9D7Ac3325ca2aD896`](https://genlayer-explorer.vercel.app/address/0x8Ed11A2C8bae3584110FecF9D7Ac3325ca2aD896)
- Deployment: live on StudioNet and responding to `genlayer schema` / `code` / `call` queries (verified 2026-08-22).
- Retrieved ABI: 18 methods (8 views, 10 writes), including `expire_stale_claim`.
- Retrieved source: matched `contracts/parametric_insurance.py` byte-for-byte
  after removing the CLI result framing.

The contract source deliberately contains no deployment address. This keeps the
repository source byte-for-byte deployable and allows the retrieved on-chain
source to match it exactly.

To inspect the deployed contract:

```bash
genlayer network set studionet
C=0x8Ed11A2C8bae3584110FecF9D7Ac3325ca2aD896
genlayer code "$C"
genlayer schema "$C"
genlayer call "$C" get_coverage_terms
genlayer call "$C" get_stats
```

StudioNet is gasless, so a zero GEN account balance does not prevent deployment
or transactions.

## State Machine

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

| State | Meaning | Money |
|-------|---------|-------|
| `ACTIVE` | Coverage is in force. | Premium is in the pool and `premium * 12` is reserved. |
| `CLAIM_SUBMITTED` | A trusted source URL was submitted during the claim window. | Reserve remains locked. |
| `SETTLED_PAID` | Consensus confirmed a qualifying delay or cancellation. | Tier payout is transferred during evaluation. |
| `REJECTED` | Consensus observed a delay below the threshold. | Premium remains in the pool. |
| `FAILED` | The flight was not present on the source. | Premium is queued for the holder in `claimable`. |
| `EXPIRED` | An unresolved policy was cleaned up after the deadline. | Premium is queued for the holder in `claimable`. |

## Coverage Timeline

The contract derives all time bounds from the scheduled departure:

```text
created ......... cutoff ......... departure ......... claim closes
|<-- buying OK -->|<-- refused -->|<-- submit/evaluate allowed -->|<-- expire
                  24h before                 7 days after
```

| Constant | Value | Enforcement |
|----------|-------|-------------|
| `COVERAGE_CUTOFF_SECONDS` | 24 hours | A policy must be created at least 24 hours before departure. |
| `CLAIM_WINDOW_SECONDS` | 7 days | Submission and evaluation are allowed from departure through `claim_closes_ts`, inclusive. |
| `MAX_ADVANCE_SECONDS` | 1 year | A policy cannot reserve pool capacity arbitrarily far in advance. |

Boundary behavior is explicit:

- At exactly `claim_closes_ts`, a submitted claim may still be evaluated.
- When `now > claim_closes_ts`, `evaluate_claim` raises
  `[EXPECTED] Claim window closed` before reserve validation, URL handling, web
  rendering, or model execution.
- `reclaim_expired` and `expire_stale_claim` reject at the exact closing instant
  and unlock only when `now > claim_closes_ts`.

`get_coverage_terms()` exposes the compiled-in enforcement points, and
`check_coverage_eligibility()` mirrors the purchase-time cutoff for auditing.

## Settlement And Liquidity

All amounts use atto-scale `u256` values (`1 GEN = 10**18 wei`). Payouts are
exact integer multiples of the premium:

| Tier | Trigger | Payout |
|------|---------|--------|
| 0 | `delay < threshold` | none (`REJECTED`) |
| 1 | `threshold <= delay < 3 * threshold` | `premium * 5` |
| 2 | `delay >= 3 * threshold` or cancellation | `premium * 12` |

Each policy locks its worst-case `premium * 12` exposure. The required solvency
invariant is:

```text
total_pool_balance_atto >= reserved_atto + unreserved_available_atto
```

Current accounting preserves equality. For either expiration method, the exact
transition is:

```text
total_pool_balance_atto -= premium
reserved_atto -= locked_reserve
unreserved_available_atto += locked_reserve - premium
claimable[policy.holder] += premium
```

The cleanup caller is not used as a refund destination. Expiration performs no
external interaction. Paid settlement records effects and validates liquidity
before emitting the native transfer. `withdraw()` zeroes a queued refund before
emitting its transfer. These paths follow Checks-Effects-Interactions.

## Public API

The contract exposes 18 public methods: 8 views and 10 writes.

| Method | Kind | Effect |
|--------|------|--------|
| `fund_pool()` | payable write | Add unreserved payout capacity. |
| `create_policy(flight_number, departure_time, delay_threshold_mins)` | payable write | Create `ACTIVE` coverage and lock worst-case exposure. |
| `submit_claim(policy_id, flight_status_url)` | write | Holder-only transition from `ACTIVE` to `CLAIM_SUBMITTED` inside the claim window. |
| `evaluate_claim(policy_id)` | write | Permissionlessly evaluate a submitted claim before or at the deadline. |
| `reclaim_expired(policy_id)` | write | Holder-only post-deadline expiration compatibility path. |
| `expire_stale_claim(policy_id)` | write | Permissionless post-deadline cleanup; refund is always credited to the holder. |
| `withdraw()` | write | Transfer the caller's queued failed/expired premium refunds using CEI. |
| `withdraw_unreserved_liquidity(amount_atto)` | write | Owner-only withdrawal capped at unreserved liquidity. |
| `add_trusted_domain(domain)` | write | Owner-only addition of a flight-status provider. |
| `remove_trusted_domain(domain)` | write | Owner-only removal of an extra provider; core providers are immutable. |
| `get_policy(policy_id)` | view | Return the full policy record. |
| `get_claim_verdict(policy_id)` | view | Return settlement status and payout details. |
| `claimable_of(account)` | view | Return a queued premium-refund balance. |
| `get_coverage_terms()` | view | Return the compiled-in timeline and enforcement points. |
| `check_coverage_eligibility(departure_time)` | view | Dry-run the purchase cutoff. |
| `is_trusted_url(url)` | view | Dry-run the source allowlist gate. |
| `get_trust_model()` | view | Return allowlist governance and enforcement details. |
| `get_stats()` | view | Return counters, liquidity terms, aliases, and invariant status. |

The machine-readable interface and behavior notes are in
[`contracts/parametric_insurance.schema.json`](contracts/parametric_insurance.schema.json).

## Consensus Evaluation

`evaluate_claim()` checks state, deadline, reserve integrity, and source trust
before entering `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`.

The leader path:

1. Renders the trusted status page with `gl.nondet.web.render`.
2. Caps content at 20,000 characters.
3. Wraps untrusted page text in a dynamic SHA-256 fence.
4. Extracts structured JSON with `gl.nondet.exec_prompt`.
5. Deterministically derives `(verdict, tier, delay)`.

Validators independently repeat the work and require the same `(verdict, tier)`.
The contract compares stable decision fields rather than volatile raw page bytes
or free-form model text.

## Source Trust Model

The beneficiary chooses which trusted provider to cite, but cannot make an
arbitrary origin authoritative. Core providers are compiled into the contract:

- `flightradar24.com`
- `flightaware.com`
- `flightstats.com`

The owner may add or remove extra providers but cannot remove a core provider.
URLs must use `https`, and host matching requires an exact domain or genuine
subdomain. Parsing rejects suffix-label spoofs, userinfo tricks, backslash
authority splits, percent-encoded hosts, IP literals, control characters, and
non-registrable hosts.

The gate runs both during `submit_claim()` and during `evaluate_claim()` before
any web or model operation. Revoking an extra provider after submission therefore
prevents later evaluation from fetching it.

## Error Taxonomy

| Prefix | Meaning | Validator rule |
|--------|---------|----------------|
| `[EXPECTED]` | Deterministic state, authorization, timeline, or accounting error. | Exact message match. |
| `[EXTERNAL]` | Deterministic source failure or not-found classification. | Exact match. |
| `[TRANSIENT]` | Network, 5xx, or blank render. | Agree only if both executions are transient. |
| `[LLM_ERROR]` | Malformed or invalid model output. | Disagree and rotate validators. |

Uncertain evaluation fails closed and leaves the policy `CLAIM_SUBMITTED` while
the window remains open. After the window closes, evaluation is disabled and
permissionless expiration guarantees reserve release without redirecting funds.

## Verification

Run contract validation before tests:

```bash
genvm-lint check contracts/parametric_insurance.py
genvm-lint typecheck contracts/parametric_insurance.py
pytest -v
```

Run full-consensus integration checks on StudioNet:

```bash
gltest tests/integration/ -v -s --network studionet
```

Direct tests use a warped clock and mocked web/model responses. They cover the
exact deadline boundary, rejection after close, permissionless cleanup of both
`ACTIVE` and `CLAIM_SUBMITTED`, single-use terminal behavior, reserve restoration,
refund ownership, and the absence of native transfers during expiration.

StudioNet has no time warp, while purchase requires a flight at least 24 hours
away. Integration tests therefore verify deployment, purchase-time boundaries,
pre-window claims, pre-deadline cleanup rejection, liquidity reads, and source
allowlisting under real consensus. The post-deadline paths remain covered in
direct mode with deterministic time travel.

## Project Layout

```text
contracts/
  parametric_insurance.py
  parametric_insurance.schema.json
deployments/
  studionet.json
docs/
  architecture.md
  superpowers/plans/2026-08-21-claim-expiry-invariants.md
tests/direct/
  test_parametric_insurance.py
  test_contract_source_boundary.py
tests/integration/
  test_parametric_insurance_integration.py
gltest.config.yaml
pytest.ini
```

The repository enforces an ASCII-only source and documentation boundary. It also
keeps every Python file either under `contracts/` as a real contract or named as
a pytest module, avoiding ambiguous source detection during GenVM validation.
