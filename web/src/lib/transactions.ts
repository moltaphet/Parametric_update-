/**
 * Transaction dispatch for the ParametricInsurance contract.
 *
 * Writes go through the wallet client created by lib/wallet.ts, which is backed
 * by MetaMask: genlayer-js delegates signing to the injected provider because
 * the client's account is an address string rather than a local account object.
 *
 * GenLayer settlement is a two-checkpoint pipeline, not a single confirmation:
 *
 *   ACCEPTED   validators accepted the transaction (optimistic, fast)
 *   FINALIZED  consensus is final and effects are durable
 *
 * `evaluate_claim` performs a real web render plus an LLM extraction under
 * consensus, so FINALIZED can take minutes. Callers receive granular stage
 * callbacks rather than a single promise, so the UI can narrate the wait
 * instead of showing a blind spinner.
 */

import type { TransactionHash } from "genlayer-js/types";
import { CONTRACT_ADDRESS } from "./contract";
import { requireWalletClient } from "./wallet";

// --------------------------------------------------------------------------- //
// Polling budgets.
//
// Generous by design: a premature timeout here reads to the user as a failed
// transaction when consensus is simply still running, which is the worst
// possible false signal for something that moves money.
// --------------------------------------------------------------------------- //
export const WAIT = {
  acceptedInterval: 4000,
  acceptedRetries: 150, // ~10 minutes
  finalizedInterval: 6000,
  finalizedRetries: 300, // ~30 minutes
} as const;

export type TxStage =
  | "idle"
  | "preparing"
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
  /** When true (default) wait through FINALIZED; otherwise stop at ACCEPTED. */
  waitForFinalized?: boolean;
}

/**
 * Submit a write and follow it through the consensus pipeline.
 *
 * Resolves once the requested checkpoint is reached; rejects with the raw SDK
 * error so the caller can classify it with `describeError` / `isUserRejection`.
 */
export async function writeAndWait({
  functionName,
  args = [],
  value = 0n,
  onStage,
  waitForFinalized = true,
}: WriteOptions): Promise<TxProgress> {
  // Throws a WalletError when no wallet is connected, which the UI turns into a
  // "connect first" prompt rather than a failed transaction.
  const client = requireWalletClient();

  onStage?.({ stage: "signing", message: "Waiting for signature..." });

  const hash = (await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args: args as never,
    value,
  })) as TransactionHash;

  onStage?.({
    stage: "submitted",
    hash,
    message: "Submitted. Waiting for validator acceptance...",
  });

  // Checkpoint 1: optimistic acceptance.
  // The status strings are a GenLayer concept the SDK's viem-derived types do
  // not model, hence the cast.
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
      ? "Accepted by validators. Finalizing..."
      : "Accepted by validators.",
    receipt: acceptedReceipt,
  });

  if (!waitForFinalized) {
    return {
      stage: "accepted",
      hash,
      message: "Accepted by validators.",
      receipt: acceptedReceipt,
    };
  }

  // Checkpoint 2: finalization. Survives the long web-render + LLM path.
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

  return {
    stage: "finalized",
    hash,
    message: "Finalized on GenLayer.",
    receipt: finalizedReceipt,
  };
}

type StageHandler = (progress: TxProgress) => void;

/**
 * Typed wrappers for every write the UI exposes.
 *
 * Centralizing the method names and argument order here means a contract
 * signature change breaks in exactly one file rather than across components.
 */
export const tx = {
  createPolicy(
    flightNumber: string,
    departureIso: string,
    thresholdMins: number,
    premiumWei: bigint,
    onStage?: StageHandler
  ) {
    return writeAndWait({
      functionName: "create_policy",
      args: [flightNumber, departureIso, thresholdMins],
      value: premiumWei,
      onStage,
    });
  },

  fundPool(amountWei: bigint, onStage?: StageHandler) {
    return writeAndWait({ functionName: "fund_pool", value: amountWei, onStage });
  },

  submitClaim(policyId: number, statusUrl: string, onStage?: StageHandler) {
    return writeAndWait({
      functionName: "submit_claim",
      args: [policyId, statusUrl],
      onStage,
    });
  },

  /** The heaviest path: web render plus LLM under consensus. Always finalize. */
  evaluateClaim(policyId: number, onStage?: StageHandler) {
    return writeAndWait({
      functionName: "evaluate_claim",
      args: [policyId],
      onStage,
      waitForFinalized: true,
    });
  },

  reclaimExpired(policyId: number, onStage?: StageHandler) {
    return writeAndWait({
      functionName: "reclaim_expired",
      args: [policyId],
      onStage,
    });
  },

  expireStaleClaim(policyId: number, onStage?: StageHandler) {
    return writeAndWait({
      functionName: "expire_stale_claim",
      args: [policyId],
      onStage,
    });
  },

  withdraw(onStage?: StageHandler) {
    return writeAndWait({ functionName: "withdraw", onStage });
  },
};

// --------------------------------------------------------------------------- //
// Error classification
// --------------------------------------------------------------------------- //

/** True when the user dismissed the wallet's signature prompt (EIP-1193 4001). */
export function isUserRejection(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (code === 4001) return true;
  const message = String(
    (error as { shortMessage?: string; message?: string })?.shortMessage ??
      (error as { message?: string })?.message ??
      ""
  ).toLowerCase();
  return (
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("request rejected")
  );
}

/** True when the account cannot cover the value plus fees. */
export function isInsufficientFunds(error: unknown): boolean {
  const message = String(
    (error as { shortMessage?: string; message?: string })?.shortMessage ??
      (error as { message?: string })?.message ??
      ""
  ).toLowerCase();
  return (
    message.includes("insufficient funds") ||
    message.includes("insufficient balance") ||
    message.includes("exceeds balance")
  );
}

/**
 * Produce a human-readable message from an SDK or consensus error.
 *
 * The contract prefixes its own failures with a classification tag
 * (`[EXPECTED]`, `[EXTERNAL]`, `[TRANSIENT]`, `[LLM_ERROR]`). When one is
 * present it is by far the most useful thing to show - "Past coverage cutoff"
 * beats a wall of RPC envelope - so it is extracted in preference to the
 * wrapper message.
 */
export function describeError(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;

  if (isUserRejection(error)) {
    return "You rejected the transaction in your wallet.";
  }
  if (isInsufficientFunds(error)) {
    return "Insufficient balance to cover the premium and fees.";
  }

  const typed = error as {
    shortMessage?: string;
    message?: string;
    details?: string;
  };
  const raw =
    typed.shortMessage || typed.message || typed.details || String(error);

  const classified = raw.match(
    /\[(?:EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\][^\n"']*/
  );
  if (classified) {
    // Strip the machine tag; the user does not need the taxonomy prefix.
    return classified[0].replace(/^\[[A-Z_]+\]\s*/, "").slice(0, 240);
  }

  return raw.slice(0, 240);
}
