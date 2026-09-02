"""End-to-end direct-mode lifecycle tests for Parametric Web Insurance.

This suite exercises the full policy lifecycle as a set of user journeys rather
than isolated units, with an emphasis on the fail-closed refund path the steward
asked for:

  1. Happy path: a qualifying delay is confirmed and pays out (tiered).
  2. Fail-closed: a missing, blank, malformed, or ambiguous oracle observation
     never reverts-and-strands and never silently keeps the premium - it routes
     to the automated unconfirmed refund path.
  3. Expiry: an unresolved policy is recovered after the claim window closes,
     both by the holder (reclaim_expired) and permissionlessly
     (expire_stale_claim), and the queued premium is withdrawable.

Direct mode runs the leader function only, so these drive the same mocks the
unit suite uses. Every helper and constant is kept inside this module on
purpose: GenVM's semantic validation would treat a bare, non-test .py file as
submitted contract source and reject it, so there is no shared conftest or
helpers module. ``test_contract_source_boundary.py`` enforces that invariant.
"""

import json
from datetime import datetime, timedelta, timezone

import pytest

CONTRACT = "contracts/parametric_insurance.py"

# Convenience wei constants (1 GEN = 10**18 wei).
GEN = 10**18
ONE_GEN = 1 * GEN

# Payout tier multipliers (must mirror the contract).
TIER1_MULTIPLIER = 5
TIER2_MULTIPLIER = 12

# Coverage timeline (must mirror the contract constants).
COVERAGE_CUTOFF_SECONDS = 24 * 60 * 60          # 24 hours
CLAIM_WINDOW_SECONDS = 7 * 24 * 60 * 60         # 7 days
MAX_ADVANCE_SECONDS = 365 * 24 * 60 * 60        # 1 year

# A canonical trusted claim URL (flightaware.com is a core immutable domain).
TRUSTED_URL = "https://www.flightaware.com/live/flight/AA100"


def shift(moment: str, **delta) -> str:
    """Offset an ISO-Z instant, e.g. ``shift(DEPARTURE, hours=1)``."""
    base = datetime.fromisoformat(moment.replace("Z", "+00:00"))
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    return (base + timedelta(**delta)).strftime("%Y-%m-%dT%H:%M:%SZ")


# The purchase instant every test warps to before creating a policy.
NOW = "2027-05-01T12:00:00Z"
# Departure 30 days out: comfortably before the cutoff and within MAX_ADVANCE.
DEPARTURE = shift(NOW, days=30)
CLAIM_CLOSES = shift(DEPARTURE, seconds=CLAIM_WINDOW_SECONDS)
INSIDE_WINDOW = shift(DEPARTURE, hours=1)
AFTER_CLOSE = shift(CLAIM_CLOSES, seconds=1)


def address_hex(account) -> str:
    """Render a direct-mode address as a canonical 0x-prefixed string."""
    raw = account if isinstance(account, bytes) else account.as_bytes
    return "0x" + bytes(raw).hex()


def _hex(account) -> str:
    """Render a raw-bytes test fixture address as a 0x hex string."""
    return "0x" + bytes(account).hex()


@pytest.fixture
def transfers(direct_vm):
    """Capture native transfers emitted by the contract in direct mode."""
    captured = []

    def hook(_vm, request):
        if "EthSend" in request:
            transfer = request["EthSend"]
            captured.append(
                {
                    "to": address_hex(transfer["address"]),
                    "value": int(transfer["value"]),
                }
            )
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = hook
    return captured


def fund_pool(direct_vm, contract, funder, amount):
    """Fund the payout pool from ``funder`` (the insurer)."""
    direct_vm.sender = funder
    direct_vm.value = amount
    contract.fund_pool()
    direct_vm.value = 0


def new_policy(
    direct_vm,
    contract,
    holder,
    insurer,
    flight_number: str = "AA100",
    departure_time: str = DEPARTURE,
    threshold: int = 60,
    premium: int = ONE_GEN,
    fund_amount: int = 20 * GEN,
    now: str = NOW,
):
    """Fund the pool and create one ACTIVE policy as ``holder``. Returns its id."""
    direct_vm.warp(now)
    if fund_amount:
        fund_pool(direct_vm, contract, insurer, fund_amount)
    direct_vm.sender = holder
    direct_vm.value = premium
    policy_id = contract.create_policy(flight_number, departure_time, threshold)
    direct_vm.value = 0
    return policy_id


def mock_flight_page(direct_vm, body: str, status: int = 200):
    """Mock the rendered flight-status page for any URL used in tests."""
    direct_vm.mock_web(r".*", {"status": status, "body": body})


def mock_extraction(direct_vm, found: bool = True, cancelled: bool = False, delay=0):
    """Mock the model's JSON extraction for the fenced extraction prompt."""
    direct_vm.mock_llm(
        r".*extraction engine.*",
        json.dumps({"found": found, "cancelled": cancelled, "delay_minutes": delay}),
    )


def mock_evaluation(direct_vm, body: str = "flight status page", **extraction):
    """Reset mocks, then mock both the render and the JSON extraction."""
    direct_vm.clear_mocks()
    mock_flight_page(direct_vm, body)
    mock_extraction(direct_vm, **extraction)


def mock_raw_extraction(direct_vm, raw_json: str, body: str = "flight status page"):
    """Reset mocks, then mock the render and a raw (possibly partial) JSON body."""
    direct_vm.clear_mocks()
    mock_flight_page(direct_vm, body)
    direct_vm.mock_llm(r".*extraction engine.*", raw_json)


def submit(direct_vm, contract, holder, policy_id, url=TRUSTED_URL, when=INSIDE_WINDOW):
    """Warp into the claim window, then submit as ``holder``."""
    direct_vm.warp(when)
    direct_vm.sender = holder
    contract.submit_claim(policy_id, url)


# --------------------------------------------------------------------------- #
# 1. Happy path: a confirmed delay pays out
# --------------------------------------------------------------------------- #
def test_lifecycle_tier1_delay_claim_pays_out(
    direct_vm, direct_deploy, direct_alice, direct_bob, transfers
):
    """Create -> submit -> evaluate a moderate delay -> exact-wei tier-1 payout."""
    contract = direct_deploy(CONTRACT)
    pid = new_policy(direct_vm, contract, direct_alice, direct_bob, threshold=60)
    submit(direct_vm, contract, direct_alice, pid)

    mock_evaluation(direct_vm, delay=90)  # threshold <= delay < 3*threshold
    assert contract.evaluate_claim(pid) == "SETTLED_PAID"

    expected = ONE_GEN * TIER1_MULTIPLIER
    assert contract.get_claim_verdict(pid)["payout_tier"] == 1
    assert contract.get_policy(pid)["payout_atto"] == str(expected)
    assert transfers == [{"to": _hex(direct_alice), "value": expected}]
    assert contract.get_stats()["settled"] == 1
    assert contract.get_stats()["reserved_atto"] == "0"
    assert contract.get_stats()["liquidity_invariant"] is True


def test_lifecycle_tier2_severe_delay_pays_out(
    direct_vm, direct_deploy, direct_alice, direct_bob, transfers
):
    """A severe delay settles at the maximum (tier-2) multiple of the premium."""
    contract = direct_deploy(CONTRACT)
    pid = new_policy(direct_vm, contract, direct_alice, direct_bob, threshold=60)
    submit(direct_vm, contract, direct_alice, pid)

    mock_evaluation(direct_vm, delay=300)  # >= 3*threshold -> tier 2
    assert contract.evaluate_claim(pid) == "SETTLED_PAID"
    assert contract.get_claim_verdict(pid)["payout_tier"] == 2
    assert transfers == [
        {"to": _hex(direct_alice), "value": ONE_GEN * TIER2_MULTIPLIER}
    ]


def test_lifecycle_below_threshold_rejected_keeps_premium(
    direct_vm, direct_deploy, direct_alice, direct_bob, transfers
):
    """A confirmed but below-threshold delay is rejected; the premium is earned."""
    contract = direct_deploy(CONTRACT)
    pid = new_policy(direct_vm, contract, direct_alice, direct_bob, threshold=60)
    submit(direct_vm, contract, direct_alice, pid)

    mock_evaluation(direct_vm, delay=15)  # below threshold
    assert contract.evaluate_claim(pid) == "REJECTED"
    assert contract.claimable_of(_hex(direct_alice)) == "0"
    assert contract.get_stats()["rejected"] == 1
    assert contract.get_stats()["failed"] == 0
    assert transfers == []


# --------------------------------------------------------------------------- #
# 2. Fail-closed: an unusable oracle observation routes to the refund path
# --------------------------------------------------------------------------- #
def test_lifecycle_blank_oracle_page_fails_closed_and_refunds(
    direct_vm, direct_deploy, direct_alice, direct_bob, transfers
):
    """A blank / network-delayed render refunds rather than reverting."""
    contract = direct_deploy(CONTRACT)
    pid = new_policy(direct_vm, contract, direct_alice, direct_bob, threshold=60)
    submit(direct_vm, contract, direct_alice, pid)

    direct_vm.clear_mocks()
    mock_flight_page(direct_vm, "")           # blank render
    mock_extraction(direct_vm, delay=300)     # would pay tier 2 if it ever parsed
    assert contract.evaluate_claim(pid) == "FAILED"
    assert contract.get_policy(pid)["verdict"] == "EXTERNAL"
    assert contract.claimable_of(_hex(direct_alice)) == str(ONE_GEN)
    assert contract.get_stats()["failed"] == 1
    assert contract.get_stats()["settled"] == 0
    assert contract.get_stats()["reserved_atto"] == "0"
    assert transfers == []


@pytest.mark.parametrize(
    "raw_json",
    [
        "not json at all",                                # unparseable
        "{}",                                             # empty payload
        '{"cancelled": false, "delay_minutes": 90}',      # no found signal
        '{"found": true}',                                # found but no delay
        '{"found": true, "cancelled": false}',            # found, no delay
        '{"found": true, "delay_minutes": "soon"}',       # non-numeric delay
        '{"found": true, "delay_minutes": null}',         # explicit null delay
        "[1, 2, 3]",                                      # wrong JSON shape
    ],
)
def test_lifecycle_malformed_oracle_fails_closed_and_refunds(
    direct_vm, direct_deploy, direct_alice, direct_bob, transfers, raw_json
):
    """Every malformed / ambiguous oracle payload settles FAILED and refunds."""
    contract = direct_deploy(CONTRACT)
    pid = new_policy(direct_vm, contract, direct_alice, direct_bob, threshold=60)
    submit(direct_vm, contract, direct_alice, pid)

    mock_raw_extraction(direct_vm, raw_json)
    assert contract.evaluate_claim(pid) == "FAILED"
    assert contract.get_policy(pid)["verdict"] == "EXTERNAL"
    assert contract.claimable_of(_hex(direct_alice)) == str(ONE_GEN)
    assert contract.get_stats()["failed"] == 1
    assert contract.get_stats()["reserved_atto"] == "0"
    assert contract.get_stats()["liquidity_invariant"] is True
    assert transfers == []


def test_lifecycle_flight_not_found_refunds(
    direct_vm, direct_deploy, direct_alice, direct_bob, transfers
):
    """A flight genuinely absent from the source refunds on the same path."""
    contract = direct_deploy(CONTRACT)
    pid = new_policy(direct_vm, contract, direct_alice, direct_bob, threshold=60)
    submit(direct_vm, contract, direct_alice, pid)

    mock_evaluation(direct_vm, found=False)
    assert contract.evaluate_claim(pid) == "FAILED"
    assert contract.claimable_of(_hex(direct_alice)) == str(ONE_GEN)
    # Refund is a queued pull payment, never a push transfer.
    assert transfers == []


def test_lifecycle_failclosed_refund_is_withdrawable(
    direct_vm, direct_deploy, direct_alice, direct_bob, transfers
):
    """The fail-closed refund is a real balance the holder can withdraw."""
    contract = direct_deploy(CONTRACT)
    pid = new_policy(direct_vm, contract, direct_alice, direct_bob, threshold=60)
    submit(direct_vm, contract, direct_alice, pid)

    mock_raw_extraction(direct_vm, "{}")
    assert contract.evaluate_claim(pid) == "FAILED"
    assert transfers == []

    direct_vm.sender = direct_alice
    contract.withdraw()
    assert contract.claimable_of(_hex(direct_alice)) == "0"
    assert transfers == [{"to": _hex(direct_alice), "value": ONE_GEN}]
    # A second withdraw is a no-op, not a double spend.
    with direct_vm.expect_revert("Nothing to withdraw"):
        contract.withdraw()


# --------------------------------------------------------------------------- #
# 3. Expiry and refund recovery after the claim window closes
# --------------------------------------------------------------------------- #
def test_lifecycle_holder_reclaims_expired_active_policy(
    direct_vm, direct_deploy, direct_alice, direct_bob, transfers
):
    """An unused active policy is refundable once the window closes."""
    contract = direct_deploy(CONTRACT)
    pid = new_policy(direct_vm, contract, direct_alice, direct_bob)
    direct_vm.warp(AFTER_CLOSE)

    direct_vm.sender = direct_alice
    contract.reclaim_expired(pid)
    assert contract.get_policy(pid)["status"] == "EXPIRED"
    assert contract.claimable_of(_hex(direct_alice)) == str(ONE_GEN)
    assert contract.get_stats()["expired"] == 1
    assert contract.get_stats()["reserved_atto"] == "0"

    direct_vm.sender = direct_alice
    contract.withdraw()
    assert transfers == [{"to": _hex(direct_alice), "value": ONE_GEN}]


def test_lifecycle_stuck_claim_reclaimed_after_close(
    direct_vm, direct_deploy, direct_alice, direct_bob, transfers
):
    """A submitted claim that could never settle is recoverable after close."""
    contract = direct_deploy(CONTRACT)
    pid = new_policy(direct_vm, contract, direct_alice, direct_bob)
    submit(direct_vm, contract, direct_alice, pid)
    direct_vm.warp(AFTER_CLOSE)

    direct_vm.sender = direct_alice
    contract.reclaim_expired(pid)
    assert contract.get_policy(pid)["status"] == "EXPIRED"
    assert contract.claimable_of(_hex(direct_alice)) == str(ONE_GEN)
    # No native transfer on reclaim; the refund is queued for withdrawal.
    assert transfers == []


def test_lifecycle_permissionless_expiry_credits_holder_only(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, transfers
):
    """Anyone may clean up a stale policy, but only the holder gets the refund."""
    contract = direct_deploy(CONTRACT)
    pid = new_policy(direct_vm, contract, direct_alice, direct_bob)
    submit(direct_vm, contract, direct_alice, pid)
    direct_vm.warp(AFTER_CLOSE)

    # A third party performs the cleanup.
    direct_vm.sender = direct_charlie
    contract.expire_stale_claim(pid)
    assert contract.get_policy(pid)["status"] == "EXPIRED"
    assert contract.claimable_of(_hex(direct_alice)) == str(ONE_GEN)
    assert contract.claimable_of(_hex(direct_charlie)) == "0"
    assert transfers == []

    # The refund still belongs to the holder alone.
    direct_vm.sender = direct_alice
    contract.withdraw()
    assert transfers == [{"to": _hex(direct_alice), "value": ONE_GEN}]


def test_lifecycle_cannot_evaluate_after_window_closes(
    direct_vm, direct_deploy, direct_alice, direct_bob, transfers
):
    """Past the deadline a claim cannot settle; the premium is reclaimed instead."""
    contract = direct_deploy(CONTRACT)
    pid = new_policy(direct_vm, contract, direct_alice, direct_bob, threshold=60)
    submit(direct_vm, contract, direct_alice, pid)

    direct_vm.warp(AFTER_CLOSE)
    mock_evaluation(direct_vm, cancelled=True, delay=999)  # would pay if reachable
    with direct_vm.expect_revert("Claim window closed"):
        contract.evaluate_claim(pid)

    assert contract.get_stats()["settled"] == 0
    contract.reclaim_expired(pid)
    assert contract.get_policy(pid)["status"] == "EXPIRED"
    assert contract.claimable_of(_hex(direct_alice)) == str(ONE_GEN)
    assert transfers == []
