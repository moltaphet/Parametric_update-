"use client";

import { AlertTriangle, Loader2, Wallet } from "lucide-react";
import { useWallet } from "@/context/wallet";
import { ConnectButton } from "./ConnectButton";
import { explorerUrl } from "@/lib/contract";
import { shortenAddress } from "@/lib/format";

/**
 * Dashboard wallet panel.
 *
 * Mirrors the navbar's state machine at full size and is where the MetaMask
 * requirements are spelled out: the StudioNet network and the GenLayer Snap are
 * both provisioned on connect, and a user should be told that rather than
 * discovering the prompts unexplained.
 */
export function WalletPanel() {
  const wallet = useWallet();

  if (wallet.isRestoring) {
    return (
      <div className="glass flex items-center gap-3 rounded-2xl px-6 py-8 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-accent-400" aria-hidden />
        Checking MetaMask...
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
        <h2 className="mt-5 text-lg font-medium text-slate-100">
          {wallet.hasInjected ? "Connect your wallet" : "MetaMask required"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
          {wallet.hasInjected
            ? "Connecting adds the GenLayer StudioNet network and installs the GenLayer Snap, which MetaMask needs in order to sign GenVM transactions. Expect two prompts the first time."
            : "This app signs with MetaMask. Install the extension, then reload this page."}
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
            Connected via {wallet.injectedName}
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

      {wallet.isWrongChain && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border
                        border-status-pending/25 bg-status-pending/5 p-4">
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-status-pending"
            aria-hidden
          />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-400">
            MetaMask is on a different network. Transactions will fail until you
            switch back to StudioNet.
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
    </div>
  );
}
