import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import * as chains from "genlayer-js/chains";
import type { GenLayerClient, GenLayerChain, TransactionHash } from "genlayer-js/types";
import type { ContractStats, PolicyRecord } from "./contract-meta";

// --------------------------------------------------------------------------- //
// Environment / configuration.
// --------------------------------------------------------------------------- //
const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ??
  "0x8Ed11A2C8bae3584110FecF9D7Ac3325ca2aD896") as `0x${string}`;

const NETWORK = (import.meta.env.VITE_GENLAYER_NETWORK ?? "studionet") as
  | "studionet"
  | "testnetAsimov"
  | "localnet";

// StudioNet block explorer. Overridable via env; defaults to the current
// GenLayer Studio explorer.
const EXPLORER_BASE = (
  import.meta.env.VITE_EXPLORER_BASE ?? "https://genlayer-explorer.vercel.app"
).replace(/\/+$/, "");

export const contractAddress = CONTRACT_ADDRESS;
export const network = NETWORK;
export const explorerBase = EXPLORER_BASE;

/** Build an explorer URL for an address or transaction hash. */
export function explorerUrl(kind: "address" | "tx", value: string): string {
  return `${EXPLORER_BASE}/${kind}/${value}`;
}

// --------------------------------------------------------------------------- //
// Extended transaction wait tuning.
//
// GenLayer settlement of evaluate_claim runs a real web render plus an LLM
// extraction under validator consensus, which can take minutes. We poll on a
// generous schedule so status updates are surfaced without ever timing out
// prematurely: ACCEPTED first (fast optimistic confirmation) then FINALIZED.
// --------------------------------------------------------------------------- //
export const WAIT = {
  // Optimistic acceptance: quick cadence, long ceiling.
  acceptedInterval: 4000,
  acceptedRetries: 150, // ~10 minutes
  // Final consensus: slower cadence, very long ceiling for LLM/web evaluation.
  finalizedInterval: 6000,
  finalizedRetries: 300, // ~30 minutes
} as const;

const LOCAL_KEY = "parametric-insurance:pk";

function resolveChain(): GenLayerChain {
  const map = chains as unknown as Record<string, GenLayerChain>;
  return map[NETWORK] ?? map.studionet;
}

// --------------------------------------------------------------------------- //
// Wallet / provider state.
//
// Two clients are kept intentionally separate:
//   - readClient  : always available, backed by an ephemeral account, used for
//                   public view calls so the dashboard renders before connect.
//   - walletClient: created on connect from the session key and cleared on
//                   disconnect. Every state-changing write goes through it, so
//                   disconnecting truly resets the local signing provider.
// --------------------------------------------------------------------------- //
let readClient: GenLayerClient<GenLayerChain> | null = null;
let walletClient: GenLayerClient<GenLayerChain> | null = null;
let accountAddress: `0x${string}` | null = null;

/** Read the stored session key without creating one. */
function readStoredKey(): `0x${string}` | null {
  try {
    const stored = localStorage.getItem(LOCAL_KEY);
    return stored && /^0x[0-9a-fA-F]{64}$/.test(stored)
      ? (stored as `0x${string}`)
      : null;
  } catch {
    return null;
  }
}

/** True when a session key exists, i.e. the user connected on a prior visit. */
export function hasStoredKey(): boolean {
  return readStoredKey() !== null;
}

export function getAccountAddress(): `0x${string}` | null {
  return accountAddress;
}

export function isConnected(): boolean {
  return walletClient !== null;
}

function getReadClient(): GenLayerClient<GenLayerChain> {
  if (readClient) return readClient;
  // Reads are public; an ephemeral throwaway account is sufficient.
  const account = createAccount(generatePrivateKey());
  readClient = createClient({ chain: resolveChain(), account });
  return readClient;
}

/** The signing client. Throws if the wallet is not connected. */
function getWalletClient(): GenLayerClient<GenLayerChain> {
  if (!walletClient) {
    throw new Error("[EXPECTED] Connect your wallet to sign transactions");
  }
  return walletClient;
}

/**
 * Connect the session wallet. Restores the persisted key when present,
 * otherwise generates and stores a fresh one. Returns the active address.
 */
export function connectWallet(): `0x${string}` {
  let key = readStoredKey();
  if (!key) {
    key = generatePrivateKey();
    try {
      localStorage.setItem(LOCAL_KEY, key);
    } catch {
      /* ignore storage errors; the in-memory session still works */
    }
  }
  const account = createAccount(key);
  accountAddress = account.address as `0x${string}`;
  walletClient = createClient({ chain: resolveChain(), account });
  return accountAddress;
}

/** Disconnect the wallet and reset the local signing provider state. */
export function disconnectWallet(): void {
  walletClient = null;
  accountAddress = null;
}

/**
 * Rotate to a brand-new session account: forget the stored key, drop the
 * provider, and connect fresh. Returns the new address.
 */
export function rotateAccount(): `0x${string}` {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore storage errors */
  }
  disconnectWallet();
  return connectWallet();
}

// --------------------------------------------------------------------------- //
// Read helpers (views). Always use the public read client.
// --------------------------------------------------------------------------- //
async function read<T>(functionName: string, args: unknown[] = []): Promise<T> {
  const client = getReadClient();
  const result = await client.readContract({
    address: contractAddress,
    functionName,
    args: args as never,
  });
  return result as T;
}

export function getStats(): Promise<ContractStats> {
  return read<ContractStats>("get_stats");
}

export function getPolicy(policyId: number): Promise<PolicyRecord> {
  return read<PolicyRecord>("get_policy", [policyId]);
}

export function getCoverageTerms(): Promise<Record<string, unknown>> {
  return read<Record<string, unknown>>("get_coverage_terms");
}

export function getTrustModel(): Promise<Record<string, unknown>> {
  return read<Record<string, unknown>>("get_trust_model");
}

export function claimableOf(account: string): Promise<string> {
  return read<string>("claimable_of", [account]);
}

export function checkCoverageEligibility(
  departureIso: string
): Promise<Record<string, unknown>> {
  return read<Record<string, unknown>>("check_coverage_eligibility", [departureIso]);
}

export function isTrustedUrl(url: string): Promise<{
  trusted: boolean;
  host: string;
  reason: string;
}> {
  return read("is_trusted_url", [url]);
}

/** Fetch every policy id up to policies_created, tolerating individual gaps. */
export async function getAllPolicies(): Promise<PolicyRecord[]> {
  const stats = await getStats();
  const total = Number(stats.policies_created) || 0;
  if (total <= 0) return [];
  const ids = Array.from({ length: total }, (_, i) => i + 1);
  const settled = await Promise.allSettled(ids.map((id) => getPolicy(id)));
  const policies: PolicyRecord[] = [];
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") policies.push(outcome.value);
  }
  return policies.sort((a, b) => b.policy_id - a.policy_id);
}

// --------------------------------------------------------------------------- //
// Transaction lifecycle. Callers receive granular progress via onStage so the
// UI can narrate the consensus pipeline rather than showing a blind spinner.
// --------------------------------------------------------------------------- //
export type TxStage =
  | "signing"
  | "submitted"
  | "accepted"
  | "finalized"
  | "error";

export interface TxProgress {
  stage: TxStage;
  hash?: `0x${string}`;
  message: string;
  receipt?: unknown;
}

interface WriteOptions {
  functionName: string;
  args?: unknown[];
  value?: bigint;
  onStage?: (progress: TxProgress) => void;
  /** When true (default) wait through to FINALIZED; otherwise stop at ACCEPTED. */
  waitForFinalized?: boolean;
}

export async function writeAndWait({
  functionName,
  args = [],
  value = 0n,
  onStage,
  waitForFinalized = true,
}: WriteOptions): Promise<TxProgress> {
  const client = getWalletClient();

  onStage?.({ stage: "signing", message: "Signing transaction..." });

  const hash = (await client.writeContract({
    address: contractAddress,
    functionName,
    args: args as never,
    value,
  })) as TransactionHash;

  onStage?.({
    stage: "submitted",
    hash,
    message: "Submitted to consensus. Waiting for validator acceptance...",
  });

  // First checkpoint: optimistic acceptance.
  const acceptedReceipt = await client.waitForTransactionReceipt({
    hash,
    status: "ACCEPTED" as never,
    interval: WAIT.acceptedInterval,
    retries: WAIT.acceptedRetries,
  });

  onStage?.({
    stage: "accepted",
    hash,
    message: waitForFinalized
      ? "Accepted by validators. Waiting for finalization..."
      : "Accepted by validators.",
    receipt: acceptedReceipt,
  });

  if (!waitForFinalized) {
    return { stage: "accepted", hash, message: "Accepted", receipt: acceptedReceipt };
  }

  // Second checkpoint: full finalization (survives long LLM / web evaluation).
  const finalizedReceipt = await client.waitForTransactionReceipt({
    hash,
    status: "FINALIZED" as never,
    interval: WAIT.finalizedInterval,
    retries: WAIT.finalizedRetries,
  });

  onStage?.({
    stage: "finalized",
    hash,
    message: "Finalized on GenLayer.",
    receipt: finalizedReceipt,
  });

  return { stage: "finalized", hash, message: "Finalized", receipt: finalizedReceipt };
}

// Convenience wrappers for each write method the UI exposes.
export const tx = {
  createPolicy(
    flightNumber: string,
    departureIso: string,
    thresholdMins: number,
    premiumWei: bigint,
    onStage?: (p: TxProgress) => void
  ) {
    return writeAndWait({
      functionName: "create_policy",
      args: [flightNumber, departureIso, thresholdMins],
      value: premiumWei,
      onStage,
    });
  },

  fundPool(amountWei: bigint, onStage?: (p: TxProgress) => void) {
    return writeAndWait({ functionName: "fund_pool", value: amountWei, onStage });
  },

  submitClaim(policyId: number, url: string, onStage?: (p: TxProgress) => void) {
    return writeAndWait({
      functionName: "submit_claim",
      args: [policyId, url],
      onStage,
    });
  },

  evaluateClaim(policyId: number, onStage?: (p: TxProgress) => void) {
    // The heaviest path: web render + LLM under consensus. Always finalize.
    return writeAndWait({
      functionName: "evaluate_claim",
      args: [policyId],
      onStage,
      waitForFinalized: true,
    });
  },

  reclaimExpired(policyId: number, onStage?: (p: TxProgress) => void) {
    return writeAndWait({ functionName: "reclaim_expired", args: [policyId], onStage });
  },

  withdraw(onStage?: (p: TxProgress) => void) {
    return writeAndWait({ functionName: "withdraw", onStage });
  },
};

/** Best-effort human message from an SDK / consensus error. */
export function describeError(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  const anyErr = err as { shortMessage?: string; message?: string; details?: string };
  const raw = anyErr.shortMessage || anyErr.message || anyErr.details || String(err);
  // Surface the contract's own classified error text when present.
  const match = raw.match(/\[(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\][^\n"']*/);
  return (match ? match[0] : raw).slice(0, 240);
}
