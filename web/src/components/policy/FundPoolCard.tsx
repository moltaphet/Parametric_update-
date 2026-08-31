"use client";

import { useMemo, useState } from "react";
import { Droplets, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { TxProgress } from "./TxProgress";
import { useTransaction } from "@/hooks/useTransaction";
import { useWallet } from "@/context/wallet";
import { tx } from "@/lib/transactions";
import { formatGen, genToWei } from "@/lib/format";
import { COVERAGE } from "@/lib/coverage";

/**
 * Underwriting capital.
 *
 * The contract fully collateralizes every policy: `create_policy` locks
 * `premium * 12` and refuses the sale unless the pool can already cover it. An
 * unfunded pool therefore rejects every purchase, which is why this panel
 * exists rather than leaving users to hit an on-chain revert.
 *
 * The owner-only withdrawal asymmetry is stated inline. Anyone can fund; only
 * the contract owner can withdraw unreserved liquidity, and a third-party
 * funder has no path to recover capital.
 */
export function FundPoolCard({
  unreservedAtto,
  onFunded,
}: {
  unreservedAtto: string | null;
  onFunded?: () => void;
}) {
  const wallet = useWallet();
  const { state, run, busy } = useTransaction();
  const [amount, setAmount] = useState("12");
  const [error, setError] = useState<string | undefined>();

  const amountWei = useMemo(() => {
    try {
      return genToWei(amount);
    } catch {
      return null;
    }
  }, [amount]);

  // Capacity this funding unlocks: a policy needs 11x its premium already in
  // the pool, since its own premium contributes the twelfth part.
  const unlockedPremium = useMemo(() => {
    if (!amountWei) return null;
    const total = (unreservedAtto ? BigInt(unreservedAtto) : 0n) + amountWei;
    return total / BigInt(COVERAGE.tier2Multiplier - 1);
  }, [amountWei, unreservedAtto]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!amountWei || amountWei <= 0n) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setError(undefined);

    const result = await run((onStage) => tx.fundPool(amountWei, onStage), {
      successTitle: "Pool funded",
      successDescription: `${formatGen(amountWei)} GEN added to underwriting capital.`,
      errorTitle: "Could not fund the pool",
    });
    if (result) onFunded?.();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="glass rounded-2xl p-6">
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-400/10
                     text-accent-400 ring-1 ring-accent-400/20"
          aria-hidden
        >
          <Droplets className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-slate-100">Underwriting pool</h2>
          <p className="text-sm text-slate-500">
            Available: {unreservedAtto === null ? "..." : formatGen(unreservedAtto)} GEN
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <Field id="fund-amount" label="Amount (GEN)" error={error}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={0}
              step="1"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(undefined);
              }}
            />
          )}
        </Field>

        {unlockedPremium !== null && unlockedPremium > 0n && (
          <p className="text-xs text-slate-500">
            Enables policies up to{" "}
            <span className="font-mono text-accent-300">
              {formatGen(unlockedPremium)} GEN
            </span>{" "}
            premium.
          </p>
        )}

        <div className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
          <p className="text-[11px] leading-relaxed text-slate-500">
            Anyone can fund, but only the contract owner can withdraw unreserved
            liquidity. There is no LP token and no refund path for funders. Do
            not fund expecting to withdraw.
          </p>
        </div>

        <TxProgress state={state} />

        <Button
          type="submit"
          variant="secondary"
          className="w-full"
          disabled={busy || !wallet.isConnected}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Funding...
            </>
          ) : wallet.isConnected ? (
            "Fund pool"
          ) : (
            "Connect wallet to fund"
          )}
        </Button>
      </div>
    </form>
  );
}
