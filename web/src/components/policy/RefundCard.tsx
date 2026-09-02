"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TxProgress } from "./TxProgress";
import { useTransaction } from "@/hooks/useTransaction";
import { useWallet } from "@/context/wallet";
import { claimableOf } from "@/lib/contract";
import { tx } from "@/lib/transactions";
import { formatGenWithUnit, toWei } from "@/lib/format";

/**
 * Claimable-balance and withdraw surface.
 *
 * Refunds - whether from a FAILED evaluation, an EXPIRED policy, or a reclaimed
 * premium - are credited to a pull-payment ledger rather than pushed, so the
 * holder must call `withdraw` to sweep them. This card reads that ledger and
 * exposes the single withdraw action that moves the money on-chain.
 */
export function RefundCard({
  refreshToken,
  onWithdrawn,
}: {
  refreshToken: number;
  onWithdrawn?: () => void;
}) {
  const wallet = useWallet();
  const { state, run, busy } = useTransaction();
  const [claimable, setClaimable] = useState<string | null>(null);

  const latestRequest = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!wallet.address) {
      setClaimable(null);
      return;
    }
    const requestId = ++latestRequest.current;
    try {
      const amount = await claimableOf(wallet.address);
      if (!mounted.current || requestId !== latestRequest.current) return;
      setClaimable(amount);
    } catch {
      if (!mounted.current || requestId !== latestRequest.current) return;
      setClaimable(null);
    }
  }, [wallet.address]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function handleWithdraw() {
    if (busy) return;
    const result = await run((onStage) => tx.withdraw(onStage), {
      successTitle: "Refund withdrawn",
      successDescription: "The claimable balance was transferred to your wallet.",
      errorTitle: "Could not withdraw",
    });
    if (!result) return;
    await load();
    onWithdrawn?.();
  }

  // Hidden entirely when there is nothing to withdraw, so it does not add noise
  // to the common case where every policy resolved to a payout or rejection.
  if (!wallet.isConnected) return null;
  const hasBalance = toWei(claimable) > 0n;
  if (!hasBalance) return null;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                     bg-status-pending/10 text-status-pending ring-1 ring-status-pending/20"
          aria-hidden
        >
          <Wallet className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-medium text-slate-100">Refund available</h2>
          <p className="mt-1 text-sm text-slate-500">
            Premiums from failed, expired, or reclaimed policies are waiting to
            be withdrawn.
          </p>
          <p className="mt-3 font-mono text-2xl text-status-paid">
            {formatGenWithUnit(claimable)}
          </p>
        </div>
      </div>

      <TxProgress state={state} />

      <Button
        type="button"
        size="lg"
        className="mt-5 w-full"
        disabled={busy}
        onClick={() => void handleWithdraw()}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Withdrawing...
          </>
        ) : (
          <>
            <ArrowDownToLine className="h-4 w-4" aria-hidden />
            Withdraw refund
          </>
        )}
      </Button>
    </div>
  );
}
