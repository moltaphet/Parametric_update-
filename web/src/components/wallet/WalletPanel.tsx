"use client";

import { AlertTriangle, KeyRound, Loader2, Wallet } from "lucide-react";
import { useWallet } from "@/context/wallet";
import { ConnectButton } from "./ConnectButton";
import { explorerUrl } from "@/lib/contract";
import { shortenAddress } from "@/lib/format";

/**
 * Dashboard wallet panel.
 *
 * Full-size mirror of the navbar control, plus the disclosures that belong on a
 * dedicated surface: which wallet is active, whether it is on the right network,
 * and the custody caveat when the in-browser fallback is in use.
 */
export function WalletPanel() {
  const wallet = useWallet();

  if (wallet.isRestoring) {
    return (
      <div className="glass flex items-center gap-3 rounded-2xl px-6 py-8 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-accent-400" aria-hidden />
        Checking for a wallet...
      </div>
    );
  }

  if (!wallet.isConnected) {
    const hasExtension = wallet.wallets.length > 0;
    return (
      <div className="glass rounded-2xl px-6 py-10 text-center">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl
                     bg-accent-400/10 text-accent-400 ring-1 ring-accent-400/20"
          aria-hidden
        >
          <Wallet className="h-5 w-5" />
        </div>
        <h2 className="mt-5 text-lg font-medium text-slate-100">No wallet connected</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
          {hasExtension
            ? "Connect to buy coverage and track your policies. Your wallet will be asked to switch to GenLayer StudioNet."
            : "No browser wallet detected. You can continue with an in-browser wallet - keys are generated and stay on this device."}
        </p>
        <div className="mt-6 flex justify-center">
          <ConnectButton className="w-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">
            {wallet.walletName ?? "In-browser wallet"}
          </p>
          <a
            href={explorerUrl("address", wallet.address ?? "")}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 block font-mono text-lg text-slate-100 transition-colors
                       hover:text-accent-300"
          >
            {shortenAddress(wallet.address)}
          </a>
          {wallet.chainId !== null && (
            <p className="mt-1 text-xs text-slate-500">Chain ID {wallet.chainId}</p>
          )}
        </div>
        <ConnectButton className="w-auto" />
      </div>

      {wallet.isWrongChain && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border
                        border-status-pending/25 bg-status-pending/5 p-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-status-pending" aria-hidden />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-400">
            Your wallet is on a different network. Transactions will fail until
            you switch back to StudioNet.
          </p>
          <button
            type="button"
            onClick={() => void wallet.switchNetwork()}
            className="rounded-lg bg-status-pending/15 px-3 py-1.5 text-xs font-medium
                       text-status-pending transition-colors hover:bg-status-pending/25"
          >
            Switch network
          </button>
        </div>
      )}

      {wallet.kind === "session" && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <p className="text-xs leading-relaxed text-slate-400">
            This key was generated in your browser and never leaves it. Clearing
            site data destroys it permanently. Do not hold value here that you
            cannot afford to lose.
          </p>
        </div>
      )}
    </div>
  );
}
