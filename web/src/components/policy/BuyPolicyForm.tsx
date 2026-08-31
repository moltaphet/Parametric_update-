"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coins,
  Gauge,
  Loader2,
  Plane,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { TxProgress } from "./TxProgress";
import { useTransaction } from "@/hooks/useTransaction";
import { useWallet } from "@/context/wallet";
import { checkCoverageEligibility } from "@/lib/contract";
import { tx } from "@/lib/transactions";
import { COVERAGE } from "@/lib/coverage";
import { formatGen, genToWei, localInputToIso } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FieldErrors {
  flight?: string;
  departure?: string;
  threshold?: string;
  premium?: string;
}

export function BuyPolicyForm({
  onCreated,
  unreservedAtto,
}: {
  onCreated?: () => void;
  /** Unreserved pool liquidity, for the pre-flight capacity check. */
  unreservedAtto?: string | null;
}) {
  const wallet = useWallet();
  const { state, run, busy } = useTransaction();

  const [flight, setFlight] = useState("");
  const [departure, setDeparture] = useState("");
  const [threshold, setThreshold] = useState("60");
  const [premium, setPremium] = useState("1");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [eligibility, setEligibility] = useState<{
    ok: boolean;
    reason: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);

  const latestCheck = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Parsed once per keystroke and reused for validation and the payout preview.
  // Invalid input yields null rather than throwing during render.
  const premiumWei = useMemo(() => {
    try {
      return genToWei(premium);
    } catch {
      return null;
    }
  }, [premium]);

  const payouts = useMemo(() => {
    if (!premiumWei) return null;
    return {
      tier1: formatGen(premiumWei * BigInt(COVERAGE.tier1Multiplier), 2),
      tier2: formatGen(premiumWei * BigInt(COVERAGE.tier2Multiplier), 2),
    };
  }, [premiumWei]);

  /**
   * Pre-flight solvency check, mirroring `create_policy`'s pool gate:
   *
   *     unreserved_available + premium >= premium * MAX_MULTIPLIER
   *
   * which rearranges to `premium <= unreserved / (MAX_MULTIPLIER - 1)`. The
   * policy's own premium covers one twelfth of its worst-case exposure, so the
   * pool must already hold the other eleven.
   *
   * Checking here matters because the alternative is a revert that only arrives
   * after the user has waited through consensus - the contract is right to
   * refuse, but finding out minutes later is a poor way to learn it.
   */
  const capacity = useMemo(() => {
    if (unreservedAtto === null || unreservedAtto === undefined) return null;
    const unreserved = BigInt(unreservedAtto);
    const maxPremium = unreserved / BigInt(COVERAGE.tier2Multiplier - 1);
    const requested = premiumWei ?? 0n;
    return {
      maxPremium,
      sufficient: requested > 0n && requested <= maxPremium,
      empty: unreserved === 0n,
    };
  }, [unreservedAtto, premiumWei]);

  // Advisory minimum for the picker. The contract is the real gate; this just
  // stops the most common mistake before it costs gas.
  const minDeparture = useMemo(() => {
    const earliest = new Date(
      Date.now() + (COVERAGE.cutoffHours + 1) * 3600 * 1000
    );
    // datetime-local wants local wall-clock, so undo the UTC offset.
    const offsetMs = earliest.getTimezoneOffset() * 60 * 1000;
    return new Date(earliest.getTime() - offsetMs).toISOString().slice(0, 16);
  }, []);

  function validate(): boolean {
    const next: FieldErrors = {};
    if (flight.trim() === "") next.flight = "Flight number is required.";
    if (departure === "") next.departure = "Departure time is required.";
    if (!(Number(threshold) > 0)) {
      next.threshold = "Threshold must be a positive number of minutes.";
    }
    if (premiumWei === null) next.premium = "Enter a valid amount.";
    else if (premiumWei <= 0n) next.premium = "Premium must be greater than zero.";
    else if (capacity && !capacity.sufficient) {
      next.premium = capacity.empty
        ? "The underwriting pool is empty. Fund it before buying coverage."
        : `Pool can only cover a premium up to ${formatGen(capacity.maxPremium)} GEN.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /**
   * Ask the contract whether this departure is insurable, using the same view
   * that mirrors `create_policy`'s gate. Advisory only - a stale clock or a
   * race can still make the write revert, which the tx handler reports.
   */
  async function verifyEligibility() {
    if (departure === "") return;

    // Editing the date and blurring again re-fires this, so several checks can
    // be in flight at once. Only the newest may write, or a slow result for a
    // previous date can land last and describe the wrong departure.
    const requestId = ++latestCheck.current;
    setChecking(true);
    try {
      const result = await checkCoverageEligibility(localInputToIso(departure));
      if (!mounted.current || requestId !== latestCheck.current) return;
      setEligibility({
        ok: Boolean(result.eligible),
        reason: String(result.reason ?? ""),
      });
    } catch {
      // A failed advisory check must never block the form; the contract still
      // enforces the rule on submit.
      if (!mounted.current || requestId !== latestCheck.current) return;
      setEligibility(null);
    } finally {
      if (mounted.current && requestId === latestCheck.current) setChecking(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !validate() || premiumWei === null) return;

    const result = await run(
      (onStage) =>
        tx.createPolicy(
          flight.trim(),
          localInputToIso(departure),
          Number(threshold),
          premiumWei,
          onStage
        ),
      {
        successTitle: "Policy created",
        successDescription: `${flight.trim()} coverage is now active.`,
        errorTitle: "Could not create policy",
      }
    );

    // run() returns null on failure and has already reported it.
    if (!result) return;

    setFlight("");
    setDeparture("");
    setEligibility(null);
    onCreated?.();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="glass rounded-2xl p-6">
      <h2 className="text-lg font-medium text-slate-100">Buy coverage</h2>
      <p className="mt-1 text-sm text-slate-500">
        Underwrite a flight at least {COVERAGE.cutoffHours}h before departure.
      </p>

      <div className="mt-6 space-y-5">
        <Field id="flight" label="Flight number" error={errors.flight} icon={<Plane className="h-4 w-4" />}>
          {(props) => (
            <Input
              {...props}
              placeholder="AA100"
              autoComplete="off"
              value={flight}
              onChange={(event) => setFlight(event.target.value.toUpperCase())}
            />
          )}
        </Field>

        <Field
          id="departure"
          label="Scheduled departure"
          error={errors.departure}
          hint={`At least ${COVERAGE.cutoffHours}h out, within ${COVERAGE.maxAdvanceDays} days. Entered in your local time.`}
          icon={<Clock className="h-4 w-4" />}
        >
          {(props) => (
            <Input
              {...props}
              type="datetime-local"
              min={minDeparture}
              value={departure}
              onChange={(event) => {
                setDeparture(event.target.value);
                setEligibility(null);
              }}
              onBlur={verifyEligibility}
            />
          )}
        </Field>

        {(checking || eligibility) && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
              checking && "text-slate-500",
              eligibility?.ok && "bg-status-paid/5 text-status-paid",
              eligibility && !eligibility.ok && "bg-status-failed/5 text-status-failed"
            )}
            role="status"
          >
            {checking ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Checking eligibility on-chain...
              </>
            ) : eligibility?.ok ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Eligible for coverage
              </>
            ) : (
              <span>{eligibility?.reason || "Not eligible"}</span>
            )}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="threshold"
            label="Delay threshold (min)"
            error={errors.threshold}
            icon={<Gauge className="h-4 w-4" />}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                inputMode="numeric"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
              />
            )}
          </Field>

          <Field
            id="premium"
            label="Premium (GEN)"
            error={errors.premium}
            icon={<Coins className="h-4 w-4" />}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                value={premium}
                onChange={(event) => setPremium(event.target.value)}
              />
            )}
          </Field>
        </div>

        {payouts && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="text-xs text-slate-500">Payout on this premium</p>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-slate-500">
                  Tier 1 ({COVERAGE.tier1Multiplier}x)
                </p>
                <p className="mt-0.5 font-mono text-sm text-slate-100">
                  {payouts.tier1} GEN
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">
                  Tier 2 ({COVERAGE.tier2Multiplier}x)
                </p>
                <p className="mt-0.5 font-mono text-sm text-accent-300">
                  {payouts.tier2} GEN
                </p>
              </div>
            </div>
          </div>
        )}

        {capacity?.empty && (
          <div
            className="flex items-start gap-2 rounded-lg border border-status-pending/25
                       bg-status-pending/5 p-3"
            role="status"
          >
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-pending"
              aria-hidden
            />
            <p className="text-[11px] leading-relaxed text-slate-400">
              The underwriting pool is empty, so the contract will refuse every
              purchase. Each policy locks {COVERAGE.tier2Multiplier}x its premium
              as reserve, so the pool must already hold{" "}
              {COVERAGE.tier2Multiplier - 1}x. Fund it first.
            </p>
          </div>
        )}

        <TxProgress state={state} />

        {wallet.isConnected ? (
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Creating policy...
              </>
            ) : (
              "Create policy"
            )}
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => wallet.connect("session")}
            disabled={wallet.isConnecting}
          >
            <Wallet className="h-4 w-4" aria-hidden />
            Connect wallet to create policy
          </Button>
        )}
      </div>
    </form>
  );
}
