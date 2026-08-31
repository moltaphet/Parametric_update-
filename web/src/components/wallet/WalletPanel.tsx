"use client";

import { KeyRound, Loader2, Wallet } from "lucide-react";
import { useWallet } from "@/context/wallet";
import { ConnectButton } from "./ConnectButton";
import { explorerUrl } from "@/lib/contract";
import { shortenAddress } from "@/lib/format";

/**
 * Dashboard wallet panel.
 *
 * Mirrors the navbar's state machine at full size, and is the surface where the
 * session-wallet custody model is spelled out. A user whose keys live in
 * localStorage needs to be told that plainly, not to discover it later.
 */
export function WalletPanel() {
  const wallet = useWallet();

  if (wallet.isRestoring) {
    return (
      <div className="glass flex items-center gap-3 rounded-2xl px-6 py-8 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-accent-400" aria-hidden />
        Restoring your session...
      </div>
    );
  }

  if (!wallet.isConnected) {
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
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
          {wallet.hasInjected
            ? "Connect your browser wallet, or use a session wallet that needs no extension."
            : "No wallet extension detected. A session wallet works here with no install - StudioNet is gasless."}
        </p>
        <div className="mt-6 flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">
            {wallet.connector === "session" ? "Session wallet" : "Browser wallet"}
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
        <ConnectButton />
      </div>

      {wallet.connector === "session" && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <p className="text-xs leading-relaxed text-slate-400">
            This session key is generated and stored in this browser only. It is
            never sent anywhere, and clearing site data destroys it. Disconnecting
            keeps the key so you can reconnect to the same address; choosing
            &quot;New session address&quot; discards it permanently. Do not hold
            value here that you cannot afford to lose.
          </p>
        </div>
      )}
    </div>
  );
}
