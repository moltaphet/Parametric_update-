"""Integration tests for Parametric Web Insurance against a real GenLayer network.

Run against studionet (gasless, no funded signer needed):

    gltest tests/integration/ -v -s --network studionet

What these add over the direct-mode suite
-----------------------------------------
Direct mode runs the leader function in-memory with a warped clock. These tests
run the real thing: deployment into GenVM, full leader + validator consensus on
every write, and the real ``gen_call`` read path. They are the proof that the
coverage cutoff, the claim window, and the source allowlist are enforced by the
*deployed bytecode* rather than only by the repository.

What they deliberately cannot cover
-----------------------------------
There is no time warp on a real network, and the contract refuses to insure a
flight less than 24h out. A policy created here therefore cannot have its claim
window opened during the run, so ``evaluate_claim``'s happy path (real
``web.render`` + ``exec_prompt`` under consensus) is out of reach for an
automated test - it would require waiting out a genuine 24h+ flight. The
boundary *rejections* are exactly what a real network can prove, and they are
what the timeline controls exist for.
"""

import re
from datetime import datetime, timedelta, timezone

import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded, tx_execution_failed

CONTRACT_NAME = "ParametricInsurance"

GEN = 10**18
ONE_GEN = 1 * GEN

COVERAGE_CUTOFF_SECONDS = 24 * 60 * 60
CLAIM_WINDOW_SECONDS = 7 * 24 * 60 * 60
MAX_ADVANCE_SECONDS = 365 * 24 * 60 * 60

# Worst-case reserve a policy locks, mirroring MAX_MULTIPLIER in the contract.
MAX_MULTIPLIER = 12

# Every policy below pays a ONE_GEN premium, and create_policy refuses to
# underwrite exposure the pool cannot already cover:
#
#     unreserved_available + premium >= premium * MAX_MULTIPLIER
#
# Unlike direct mode, this module shares ONE deployment across all tests, so the
# reserves accumulate: N policies need N * MAX_MULTIPLIER GEN of capacity up
# front. Sizing the funding from that count (rather than a flat number) means
# adding a policy test does not silently exhaust the pool and surface as a
# confusing "Pool cannot cover exposure" revert in an unrelated assertion.
POLICIES_CREATED_BY_MODULE = 2          # the AA100 and AA200 policies below
POOL_HEADROOM_GEN = 8                   # slack so the suite is not exact-fit
POOL_FUNDING = (MAX_MULTIPLIER * POLICIES_CREATED_BY_MODULE + POOL_HEADROOM_GEN) * GEN

TRUSTED_URL = "https://www.flightaware.com/live/flight/AA100"


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _from_now(**delta) -> str:
    """An ISO-Z instant relative to real wall-clock UTC now."""
    return _iso(datetime.now(timezone.utc) + timedelta(**delta))


def revert_message(receipt) -> str:
    """Best-effort extraction of the revert text from a failed receipt.

    A reverting GenVM call reports its message in the leader receipt; the exact
    envelope has varied across studio versions, so this searches the receipt
    rather than assuming one shape. Returned lower-cased-safe as raw text.
    """
    import json

    try:
        blob = json.dumps(receipt, default=str)
    except (TypeError, ValueError):
        blob = str(receipt)
    return blob


def assert_reverted_with(receipt, needle: str) -> None:
    """Assert the transaction failed *and* failed for the expected reason."""
    assert tx_execution_failed(receipt), f"expected revert, got success: {receipt}"
    blob = revert_message(receipt)
    assert needle in blob, f"expected {needle!r} in revert payload, got: {blob[:2000]}"


def assert_succeeded(receipt, what: str) -> None:
    """Assert a setup transaction landed, naming the revert reason if it did not.

    A bare ``assert tx_execution_succeeded(receipt)`` reports only a truncated
    receipt repr, which elides the single useful field - the classified error
    string the contract raised. Surface it instead.
    """
    if tx_execution_succeeded(receipt):
        return
    blob = revert_message(receipt)
    classified = re.findall(
        r"\[(?:EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\][^\"\\]{0,200}", blob
    )
    detail = "; ".join(dict.fromkeys(classified)) or blob[:2000]
    raise AssertionError(f"{what} unexpectedly reverted: {detail}")


# --------------------------------------------------------------------------- #
# One deployment shared by the whole module - this is the address under test.
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def contract():
    factory = get_contract_factory(CONTRACT_NAME)
    deployed = factory.deploy(args=[])
    print(f"\n>>> DEPLOYED {CONTRACT_NAME} at {deployed.address}\n")
    return deployed


def test_deployment_reports_address(contract):
    """Deployment succeeded and the address is well-formed."""
    assert contract.address.startswith("0x")
    assert len(contract.address) == 42
    print(f"\n>>> CONTRACT ADDRESS: {contract.address}\n")


# --------------------------------------------------------------------------- #
# Coverage timeline - live in the deployed bytecode
# --------------------------------------------------------------------------- #
def test_coverage_terms_live_on_chain(contract):
    """The enforced cutoff and window come back from the deployed contract."""
    terms = contract.get_coverage_terms(args=[]).call()
    print(f"\n>>> get_coverage_terms: {terms}\n")

    assert terms["coverage_cutoff_seconds"] == COVERAGE_CUTOFF_SECONDS
    assert terms["claim_window_seconds"] == CLAIM_WINDOW_SECONDS
    assert terms["max_advance_seconds"] == MAX_ADVANCE_SECONDS
    # The bounds are constants in the bytecode, not per-policy parameters.
    assert terms["caller_supplied"] is False
    assert "create_policy" in terms["enforced_at"]
    assert "submit_claim" in terms["enforced_at"]
    assert "evaluate_claim" in terms["enforced_at"]
    assert "expire_stale_claim" in terms["enforced_at"]


def test_coverage_eligibility_view_on_chain(contract):
    """The cutoff is computed on-chain against the node's own clock."""
    ok = contract.check_coverage_eligibility(args=[_from_now(days=30)]).call()
    print(f"\n>>> eligible(+30d): {ok}\n")
    assert ok["eligible"] is True
    assert ok["reason"] == ""
    assert ok["departure_ts"] - ok["cutoff_ts"] == COVERAGE_CUTOFF_SECONDS
    assert ok["claim_closes_ts"] - ok["claim_opens_ts"] == CLAIM_WINDOW_SECONDS

    departed = contract.check_coverage_eligibility(args=[_from_now(days=-1)]).call()
    assert departed["eligible"] is False
    assert departed["reason"] == "Flight already departed"

    inside = contract.check_coverage_eligibility(args=[_from_now(hours=2)]).call()
    print(f"\n>>> eligible(+2h): {inside}\n")
    assert inside["eligible"] is False
    assert "Past coverage cutoff" in inside["reason"]

    too_far = contract.check_coverage_eligibility(args=[_from_now(days=400)]).call()
    assert too_far["reason"] == "Departure too far in the future"

    bad = contract.check_coverage_eligibility(args=["not-a-date"]).call()
    assert bad["eligible"] is False
    assert bad["reason"] == "Invalid ISO datetime"


# --------------------------------------------------------------------------- #
# create_policy under real consensus
# --------------------------------------------------------------------------- #
def test_fund_pool_under_consensus(contract):
    """A payable write settles through leader + validator consensus."""
    receipt = contract.fund_pool(args=[]).transact(value=POOL_FUNDING)
    print(f"\n>>> fund_pool tx: {receipt.get('hash', receipt.get('tx_id'))}\n")
    assert tx_execution_succeeded(receipt)

    stats = contract.get_stats(args=[]).call()
    total = int(stats["total_pool_balance_atto"])
    reserved = int(stats["reserved_atto"])
    unreserved = int(stats["unreserved_available_atto"])
    assert total >= POOL_FUNDING
    assert total == reserved + unreserved
    assert stats["liquidity_invariant"] is True


def test_create_policy_before_cutoff_succeeds(contract):
    """A flight 30 days out is insurable, and the window is derived on-chain."""
    departure = _from_now(days=30)
    receipt = contract.create_policy(args=["AA100", departure, 60]).transact(
        value=ONE_GEN
    )
    print(f"\n>>> create_policy tx: {receipt.get('hash', receipt.get('tx_id'))}\n")
    assert_succeeded(receipt, "create_policy(AA100)")

    stats = contract.get_stats(args=[]).call()
    policy_id = stats["policies_created"]
    policy = contract.get_policy(args=[policy_id]).call()
    print(f"\n>>> policy {policy_id}: {policy}\n")

    assert policy["status"] == "ACTIVE"
    assert policy["departure_time"] == departure
    assert policy["locked_reserve_atto"] == policy["max_exposure_atto"]
    # Derived, not supplied: exactly one window length after departure.
    assert policy["claim_closes_ts"] - policy["departure_ts"] == CLAIM_WINDOW_SECONDS
    # Bought before the flight, so the window is not open yet.
    assert policy["claim_window_open"] is False


def test_create_policy_inside_cutoff_is_rejected_on_chain(contract):
    """The reviewer's core case: a policy bought inside the 24h cutoff reverts."""
    receipt = contract.create_policy(args=["AA100", _from_now(hours=2), 60]).transact(
        value=ONE_GEN
    )
    assert_reverted_with(receipt, "Past coverage cutoff")


def test_create_policy_for_departed_flight_is_rejected_on_chain(contract):
    """A flight that already happened can never be insured."""
    receipt = contract.create_policy(args=["AA100", _from_now(days=-2), 60]).transact(
        value=ONE_GEN
    )
    assert_reverted_with(receipt, "Flight already departed")


def test_create_policy_too_far_out_is_rejected_on_chain(contract):
    receipt = contract.create_policy(args=["AA100", _from_now(days=400), 60]).transact(
        value=ONE_GEN
    )
    assert_reverted_with(receipt, "Departure too far in the future")


# --------------------------------------------------------------------------- #
# Claim window under real consensus
# --------------------------------------------------------------------------- #
def test_claim_before_window_opens_is_rejected_on_chain(contract):
    """A policy created here cannot yet be claimed - the flight has not departed.

    This is the bounded-window gate observed on a live network: the holder is
    the caller, the URL is a trusted origin, and the claim still reverts purely
    because the window has not opened.
    """
    departure = _from_now(days=30)
    created = contract.create_policy(args=["AA200", departure, 60]).transact(
        value=ONE_GEN
    )
    assert_succeeded(created, "create_policy(AA200)")
    policy_id = contract.get_stats(args=[]).call()["policies_created"]

    receipt = contract.submit_claim(args=[policy_id, TRUSTED_URL]).transact()
    assert_reverted_with(receipt, "Claim window not open")

    # Fail-closed: nothing stored; the holder can still submit a claim later.
    policy = contract.get_policy(args=[policy_id]).call()
    assert policy["status"] == "ACTIVE"
    assert policy["flight_status_url"] == ""


def test_reclaim_before_window_closes_is_rejected_on_chain(contract):
    """The premium is not recoverable while a claim is still admissible."""
    policy_id = contract.get_stats(args=[]).call()["policies_created"]
    receipt = contract.reclaim_expired(args=[policy_id]).transact()
    assert_reverted_with(receipt, "Claim window still open")


def test_permissionless_expiry_before_window_closes_is_rejected_on_chain(contract):
    """The cleanup method is public but cannot move money before the deadline."""
    policy_id = contract.get_stats(args=[]).call()["policies_created"]
    receipt = contract.expire_stale_claim(args=[policy_id]).transact()
    assert_reverted_with(receipt, "Claim window still open")


# --------------------------------------------------------------------------- #
# Source allowlist - live in the deployed bytecode
# --------------------------------------------------------------------------- #
def test_trust_model_live_on_chain(contract):
    model = contract.get_trust_model(args=[]).call()
    print(f"\n>>> get_trust_model: {model}\n")
    assert model["core_immutable"] is True
    assert model["allowed_scheme"] == "https"
    assert sorted(model["core_domains"]) == sorted(
        ["flightaware.com", "flightradar24.com", "flightstats.com"]
    )
    assert "evaluate_claim" in model["enforced_at"]


@pytest.mark.parametrize(
    "url,trusted",
    [
        ("https://www.flightaware.com/live/flight/AA100", True),
        ("https://flightradar24.com/AA100", True),
        ("https://evil.com/AA100", False),                   # plainly untrusted
        ("https://flightaware.com.evil.com/AA100", False),   # suffix-label spoof
        ("https://flightaware.com@evil.com/AA100", False),   # userinfo trick
        ("https://evil.com\\@flightaware.com/", False),      # WHATWG backslash
        ("http://flightaware.com/AA100", False),             # plaintext transport
    ],
)
def test_allowlist_gate_on_chain(contract, url, trusted):
    """Every bypass class is judged by the deployed bytecode, not the repo."""
    result = contract.is_trusted_url(args=[url]).call()
    assert result["trusted"] is trusted, f"{url} -> {result}"


def test_untrusted_claim_url_rejected_on_chain(contract):
    """The allowlist reverts a real claim before any render can happen."""
    policy_id = contract.get_stats(args=[]).call()["policies_created"]
    receipt = contract.submit_claim(
        args=[policy_id, "https://attacker-controlled.example/AA100"]
    ).transact()
    assert_reverted_with(receipt, "Untrusted flight-status source")
