// Static presentation metadata derived from the ParametricInsurance schema.
// Kept in one place so status colors and copy stay consistent across the UI.

export type PolicyStatus =
  | "ACTIVE"
  | "CLAIM_SUBMITTED"
  | "SETTLED_PAID"
  | "REJECTED"
  | "EXPIRED"
  | "FAILED";

export type BadgeTone = "primary" | "accent" | "success" | "warning" | "destructive" | "muted";

export interface StatusMeta {
  label: string;
  tone: BadgeTone;
  description: string;
}

export const STATUS_META: Record<PolicyStatus, StatusMeta> = {
  ACTIVE: {
    label: "Active",
    tone: "accent",
    description: "Coverage is in force. Premium is escrowed and worst-case exposure is reserved.",
  },
  CLAIM_SUBMITTED: {
    label: "Claim submitted",
    tone: "warning",
    description: "A trusted source URL was cited. Awaiting validator consensus evaluation.",
  },
  SETTLED_PAID: {
    label: "Settled - paid",
    tone: "success",
    description: "Consensus confirmed a qualifying delay. The tier payout was transferred natively.",
  },
  REJECTED: {
    label: "Rejected",
    tone: "muted",
    description: "Consensus observed a delay below the threshold. The premium stays in the pool.",
  },
  EXPIRED: {
    label: "Expired",
    tone: "muted",
    description: "An unresolved policy was cleaned up after the deadline. Premium is queued for refund.",
  },
  FAILED: {
    label: "Failed",
    tone: "muted",
    description: "The flight was not present on the source. Premium is queued for refund.",
  },
};

export function statusMeta(status: string): StatusMeta {
  return (
    STATUS_META[status as PolicyStatus] ?? {
      label: status || "Unknown",
      tone: "muted",
      description: "",
    }
  );
}

// Immutable core flight-status providers compiled into the contract.
export const CORE_TRUSTED_DOMAINS = [
  "flightradar24.com",
  "flightaware.com",
  "flightstats.com",
];

// Compiled-in coverage timeline constants (advisory copy only; the contract enforces them).
export const COVERAGE = {
  cutoffHours: 24,
  claimWindowDays: 7,
  maxAdvanceDays: 365,
  tier1Multiplier: 5,
  tier2Multiplier: 12,
};

export interface PolicyRecord {
  policy_id: number;
  holder: string;
  status: string;
  premium_atto: string;
  max_exposure_atto: string;
  locked_reserve_atto: string;
  payout_atto: string;
  flight_number: string;
  departure_time: string;
  departure_ts: number;
  delay_threshold_mins: number;
  claim_opens_ts: number;
  claim_opens: string;
  claim_closes_ts: number;
  claim_closes: string;
  claim_window_open: boolean;
  flight_status_url: string;
  verdict: string;
  payout_tier: number;
  observed_delay_mins: number;
  decision_reason: string;
}

export interface ContractStats {
  policies_created: number;
  settled: number;
  rejected: number;
  failed: number;
  expired: number;
  total_paid_atto: string;
  total_pool_balance_atto: string;
  reserved_atto: string;
  unreserved_available_atto: string;
  liquidity_invariant: boolean;
}
