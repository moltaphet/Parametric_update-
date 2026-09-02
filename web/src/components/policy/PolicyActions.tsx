"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Gavel,
  Link2,
  Loader2,
  Send,
  ShieldQuestion,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { TxProgress } from "./TxProgress";
import { useTransaction } from "@/hooks/useTransaction";
import { isTrustedUrl, type PolicyRecord } from "@/lib/contract";
import { tx } from "@/lib/transactions";
import { cn } from "@/lib/utils";

/**
 * Per-policy claim-lifecycle controls.
 *
 * Each row owns its own transaction state so several policies can be acted on
 * independently. Which control is offered is derived from the policy's status
 * and the clock, mirroring exactly what the contract will accept:
 *
 *   ACTIVE + window open ......... submit_claim
 *   ACTIVE + window closed ....... reclaim_expired (unused premium back)
 *   CLAIM_SUBMITTED + open ....... evaluate_claim (render + LLM under consensus)
 *   CLAIM_SUBMITTED + closed ..... reclaim_expired (stuck claim recovery)
 *   FAILED / EXPIRED ............. premium is refundable; withdraw below
 *
 * The contract remains the sole authority: these gates only spare the user a
 * revert that would otherwise arrive minutes later, after consensus.
 */
export function PolicyActions({
  policy,
  onAction,
}: {
  policy: PolicyRecord;
  onAction?: () => void;
}) {
  const { state, run, busy } = useTransaction();
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // The contract derives both bounds from the departure; recompute the "closed"
  // edge client-side so the right control shows the instant the window lapses,
  // without waiting for a fresh read.
  const nowSec = Math.floor(Date.now() / 1000);
  const windowClosed = nowSec > policy.claim_closes_ts;
  const windowOpen = policy.claim_window_open;

  const status = policy.status;

  async function handleSubmitClaim() {
    if (busy) return;
    const trimmed = url.trim();
    if (trimmed === "") {
      setUrlError("Enter the flight-status page to cite.");
      return;
    }

    // Soft pre-flight against the same allowlist the contract enforces. Advisory
    // only: a failed check never blocks submission, the contract still decides.
    setChecking(true);
    try {
      const verdict = await isTrustedUrl(trimmed);
      if (!verdict.trusted) {
        setUrlError(verdict.reason || "That source is not on the allowlist.");
        setChecking(false);
        return;
      }
    } catch {
      // Ignore; fall through to the on-chain enforcement.
    } finally {
      setChecking(false);
    }

    setUrlError(null);
    const result = await run(
      (onStage) => tx.submitClaim(policy.policy_id, trimmed, onStage),
      {
        successTitle: "Claim submitted",
        successDescription: `Cited a source for ${policy.flight_number}.`,
        errorTitle: "Could not submit claim",
      }
    );
    if (!result) return;
    setUrl("");
    onAction?.();
  }

  async function handleEvaluate() {
    if (busy) return;
    const result = await run(
      (onStage) => tx.evaluateClaim(policy.policy_id, onStage),
      {
        successTitle: "Claim evaluated",
        successDescription: "Validators reached consensus on the source.",
        errorTitle: "Could not evaluate claim",
      }
    );
    if (result) onAction?.();
  }

  async function handleReclaim() {
    if (busy) return;
    const result = await run(
      (onStage) => tx.reclaimExpired(policy.policy_id, onStage),
      {
        successTitle: "Premium reclaimed",
        successDescription: "The refund is queued for withdrawal below.",
        errorTitle: "Could not reclaim premium",
      }
    );
    if (result) onAction?.();
  }

  const body = useMemo(() => {
    if (status === "ACTIVE" && windowOpen) {
      return (
        <div className="space-y-2">
          <label
            htmlFor={`claim-url-${policy.policy_id}`}
            className="flex items-center gap-1.5 text-xs text-slate-400"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            Cite an allowlisted flight-status page
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`claim-url-${policy.policy_id}`}
              value={url}
              placeholder="https://flightaware.com/live/flight/..."
              autoComplete="off"
              aria-invalid={Boolean(urlError)}
              onChange={(event) => {
                setUrl(event.target.value);
                setUrlError(null);
              }}
            />
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              disabled={busy || checking}
              onClick={() => void handleSubmitClaim()}
            >
              {busy || checking ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              Submit claim
            </Button>
          </div>
          {urlError && (
            <p role="alert" className="text-xs text-status-failed">
              {urlError}
            </p>
          )}
        </div>
      );
    }

    if (status === "ACTIVE" && !windowOpen && !windowClosed) {
      return (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />
          Coverage is active. A claim can be filed from {policy.claim_opens}.
        </p>
      );
    }

    if (status === "CLAIM_SUBMITTED" && !windowClosed) {
      return (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void handleEvaluate()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Gavel className="h-4 w-4" aria-hidden />
          )}
          Evaluate claim
        </Button>
      );
    }

    // ACTIVE or CLAIM_SUBMITTED past the deadline: recover the premium.
    if (
      (status === "ACTIVE" || status === "CLAIM_SUBMITTED") &&
      windowClosed
    ) {
      return (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void handleReclaim()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ArrowDownToLine className="h-4 w-4" aria-hidden />
          )}
          Reclaim premium
        </Button>
      );
    }

    if (status === "FAILED" || status === "EXPIRED") {
      return (
        <p className="flex items-center gap-1.5 text-xs text-status-pending">
          <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
          Premium refunded to your claimable balance. Withdraw it below.
        </p>
      );
    }

    return null;
  }, [status, windowOpen, windowClosed, url, urlError, busy, checking, policy]);

  if (!body) return null;

  return (
    <div className={cn("mt-4 border-t border-white/[0.06] pt-4")}>
      {body}
      <TxProgress state={state} />
    </div>
  );
}
