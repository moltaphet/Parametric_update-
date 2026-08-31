/**
 * Coverage constants mirrored from the contract.
 *
 * These are compiled into the deployed bytecode, so they are safe to hold
 * client-side: they render instantly and identically for every visitor with no
 * RPC round trip. `get_coverage_terms()` remains the authoritative source, and
 * `check_coverage_eligibility()` is used to confirm a specific departure before
 * the user spends gas - the values here only drive input hints and previews.
 */
export const COVERAGE = {
  cutoffHours: 24,
  claimWindowDays: 7,
  maxAdvanceDays: 365,
  tier1Multiplier: 5,
  tier2Multiplier: 12,
} as const;

export type PolicyStatus =
  | "ACTIVE"
  | "CLAIM_SUBMITTED"
  | "SETTLED_PAID"
  | "REJECTED"
  | "EXPIRED"
  | "FAILED";

interface StatusMeta {
  label: string;
  /** Maps to the status-* color tokens in globals.css. */
  color: string;
  description: string;
}

export const STATUS_META: Record<PolicyStatus, StatusMeta> = {
  ACTIVE: {
    label: "Active",
    color: "text-status-active",
    description: "Coverage is in force. Worst-case exposure is reserved.",
  },
  CLAIM_SUBMITTED: {
    label: "Claim submitted",
    color: "text-status-pending",
    description: "Awaiting validator consensus on the cited source.",
  },
  SETTLED_PAID: {
    label: "Paid",
    color: "text-status-paid",
    description: "Consensus confirmed a qualifying delay. Payout transferred.",
  },
  REJECTED: {
    label: "Rejected",
    color: "text-status-rejected",
    description: "Delay was below the threshold. Premium stays in the pool.",
  },
  EXPIRED: {
    label: "Expired",
    color: "text-status-rejected",
    description: "Cleaned up after the deadline. Premium refundable.",
  },
  FAILED: {
    label: "Failed",
    color: "text-status-failed",
    description: "The flight was not found on the source. Premium refundable.",
  },
};
