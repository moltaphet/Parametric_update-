/**
 * Read-only contract access for the landing page.
 *
 * This is the read half of the integration layer, ported from the Vite client's
 * `src/lib/genlayer.ts`. Only public views are exposed here: the landing page
 * never signs anything, so no wallet client is constructed and MetaMask is not
 * touched. The write path is layered on top of this module in transactions.ts.
 *
 * Reads go through an ephemeral throwaway account because GenLayer's client
 * requires an account to build a call, but view calls are public and the key is
 * never persisted or used to sign.
 */

import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import * as chains from "genlayer-js/chains";
import type { GenLayerChain, GenLayerClient } from "genlayer-js/types";

// --------------------------------------------------------------------------- //
// Configuration
// --------------------------------------------------------------------------- //
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ??
  "0x8Ed11A2C8bae3584110FecF9D7Ac3325ca2aD896") as `0x${string}`;

export const NETWORK = (process.env.NEXT_PUBLIC_GENLAYER_NETWORK ??
  "studionet") as "studionet" | "testnetAsimov" | "localnet";

export const EXPLORER_BASE = (
  process.env.NEXT_PUBLIC_EXPLORER_BASE ?? "https://genlayer-explorer.vercel.app"
).replace(/\/+$/, "");

export function explorerUrl(kind: "address" | "tx", value: string): string {
  return `${EXPLORER_BASE}/${kind}/${value}`;
}

// --------------------------------------------------------------------------- //
// Types mirroring the contract's view returns.
//
// Amounts arrive as decimal strings of wei; they stay strings here and are
// converted with BigInt at the formatting boundary. See lib/format.ts.
// --------------------------------------------------------------------------- //
export interface ContractStats {
  policies_created: number;
  settled: number;
  rejected: number;
  failed: number;
  expired: number;
  total_paid_atto: string;
  pool_balance_atto: string;
  total_pool_balance_atto: string;
  reserved_atto: string;
  available_atto: string;
  unreserved_available_atto: string;
  liquidity_invariant: boolean;
}

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

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
  departure_ts: number;
  cutoff_ts: number;
  claim_opens_ts: number;
  claim_closes_ts: number;
  claim_closes?: string;
}

export interface CoverageTerms {
  coverage_cutoff_seconds: number;
  coverage_cutoff_hours: number;
  claim_window_seconds: number;
  claim_window_days: number;
  max_advance_seconds: number;
  caller_supplied: boolean;
  enforced_at: string[];
  policy: string;
}

// --------------------------------------------------------------------------- //
// Client
// --------------------------------------------------------------------------- //
function resolveChain(): GenLayerChain {
  const map = chains as unknown as Record<string, GenLayerChain>;
  return map[NETWORK] ?? map.studionet;
}

let readClient: GenLayerClient<GenLayerChain> | null = null;

function getReadClient(): GenLayerClient<GenLayerChain> {
  if (readClient) return readClient;
  const account = createAccount(generatePrivateKey());
  readClient = createClient({ chain: resolveChain(), account });
  return readClient;
}

async function read<T>(functionName: string, args: unknown[] = []): Promise<T> {
  const client = getReadClient();
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args: args as never,
  });
  return result as T;
}

// --------------------------------------------------------------------------- //
// Public views used by the landing page
// --------------------------------------------------------------------------- //
export function getStats(): Promise<ContractStats> {
  return read<ContractStats>("get_stats");
}

export function getCoverageTerms(): Promise<CoverageTerms> {
  return read<CoverageTerms>("get_coverage_terms");
}

export function getPolicy(policyId: number): Promise<PolicyRecord> {
  return read<PolicyRecord>("get_policy", [policyId]);
}

export function claimableOf(account: string): Promise<string> {
  return read<string>("claimable_of", [account]);
}

export function checkCoverageEligibility(
  departureIso: string
): Promise<EligibilityResult> {
  return read<EligibilityResult>("check_coverage_eligibility", [departureIso]);
}

export function isTrustedUrl(
  url: string
): Promise<{ trusted: boolean; host: string; reason: string }> {
  return read("is_trusted_url", [url]);
}

/**
 * Fetch every policy, newest first.
 *
 * The contract exposes no enumeration, so ids are walked from 1 to
 * `policies_created`. `allSettled` rather than `all` because one unreadable
 * policy must not blank the whole list - a partial list is far more useful than
 * an error screen.
 */
export async function getAllPolicies(): Promise<PolicyRecord[]> {
  const stats = await getStats();
  const total = Number(stats.policies_created) || 0;
  if (total <= 0) return [];

  const ids = Array.from({ length: total }, (_, index) => index + 1);
  const settled = await Promise.allSettled(ids.map((id) => getPolicy(id)));

  return settled
    .filter(
      (outcome): outcome is PromiseFulfilledResult<PolicyRecord> =>
        outcome.status === "fulfilled"
    )
    .map((outcome) => outcome.value)
    .sort((a, b) => b.policy_id - a.policy_id);
}
