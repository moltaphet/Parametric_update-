"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/context/wallet";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { explorerUrl } from "@/lib/contract";
import { shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Wallet control.
 *
 * States are deliberately flat: Restoring, Connected, Connecting, Connect.
 * The only branch is the wallet chooser, and it appears only when more than one
 * extension is installed - with a single wallet, clicking connects it directly
 * rather than making the user pick from a list of one.
 */
export function ConnectButton({ className }: { className?: string }) {
  const wallet = useWallet();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !chooserOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setChooserOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setChooserOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, chooserOpen]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyAddress() {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
    } catch {
      toast({ tone: "error", title: "Could not copy address" });
    }
  }

  function handleConnectClick() {
    // One wallet: connect it. Several: let the user choose, so a Rabby user is
    // never handed a MetaMask prompt (or the reverse).
    if (wallet.wallets.length > 1) {
      setChooserOpen((open) => !open);
      return;
    }
    if (wallet.wallets.length === 1) {
      void wallet.connect(wallet.wallets[0].id);
      return;
    }
    wallet.connectFallback();
  }

  // --- Restoring ---------------------------------------------------------- //
  if (wallet.isRestoring) {
    return (
      <div
        className={cn("h-9 w-32 animate-pulse rounded-xl bg-white/[0.06]", className)}
        aria-hidden
      />
    );
  }

  // --- Connected ---------------------------------------------------------- //
  if (wallet.isConnected && wallet.address) {
    return (
      <div ref={containerRef} className={cn("relative", className)}>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="glass inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm
                     text-slate-100 transition-colors hover:bg-white/[0.08]"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              wallet.isWrongChain
                ? "bg-status-pending"
                : "bg-status-paid shadow-[0_0_8px_var(--color-status-paid)]"
            )}
            aria-hidden
          />
          <span className="font-mono text-xs">{shortenAddress(wallet.address)}</span>
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="glass-strong absolute right-0 z-50 mt-2 w-72 rounded-xl p-2 shadow-xl"
              role="menu"
            >
              <div className="px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">
                  {wallet.walletName ?? "In-browser wallet"}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-slate-200">
                  {wallet.address}
                </p>
                {wallet.chainId !== null && (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Chain ID {wallet.chainId}
                  </p>
                )}
              </div>

              {wallet.isWrongChain && (
                <div className="mx-1 mb-1 rounded-lg border border-status-pending/25 bg-status-pending/5 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-pending"
                      aria-hidden
                    />
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      Your wallet is on a different network.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void wallet.switchNetwork();
                    }}
                    className="mt-2 w-full rounded-md bg-status-pending/15 px-2 py-1.5
                               text-[11px] font-medium text-status-pending
                               transition-colors hover:bg-status-pending/25"
                  >
                    Switch to StudioNet
                  </button>
                </div>
              )}

              <div className="h-px bg-white/[0.06]" />

              <MenuItem onClick={copyAddress} icon={copied ? Check : Copy}>
                {copied ? "Copied" : "Copy address"}
              </MenuItem>
              <MenuItem href={explorerUrl("address", wallet.address)} icon={ExternalLink}>
                View on explorer
              </MenuItem>

              <div className="my-1 h-px bg-white/[0.06]" />

              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  wallet.disconnect();
                }}
                icon={LogOut}
                tone="danger"
              >
                Disconnect
              </MenuItem>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // --- Disconnected ------------------------------------------------------- //
  const label =
    wallet.wallets.length === 1 ? `Connect ${wallet.wallets[0].name}` : "Connect wallet";

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Button
        size="sm"
        onClick={handleConnectClick}
        disabled={wallet.isConnecting}
        aria-expanded={wallet.wallets.length > 1 ? chooserOpen : undefined}
        aria-haspopup={wallet.wallets.length > 1 ? "menu" : undefined}
        className="w-full"
      >
        {wallet.isConnecting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Connecting...
          </>
        ) : (
          <>
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            {label}
          </>
        )}
      </Button>

      <AnimatePresence>
        {chooserOpen && wallet.wallets.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong absolute right-0 z-50 mt-2 w-64 rounded-xl p-2 shadow-xl"
            role="menu"
          >
            <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wider text-slate-500">
              Select a wallet
            </p>
            {wallet.wallets.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setChooserOpen(false);
                  void wallet.connect(option.id);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left
                           text-sm text-slate-200 transition-colors hover:bg-white/[0.06]"
              >
                {option.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={option.icon} alt="" className="h-5 w-5 rounded" />
                ) : (
                  <Wallet className="h-4 w-4 text-slate-500" aria-hidden />
                )}
                {option.name}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --------------------------------------------------------------------------- //
function MenuItem({
  children,
  icon: Icon,
  onClick,
  href,
  tone = "default",
}: {
  children: React.ReactNode;
  icon: typeof Copy;
  onClick?: () => void;
  href?: string;
  tone?: "default" | "danger";
}) {
  const classes = cn(
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
    tone === "danger"
      ? "text-status-failed hover:bg-status-failed/10"
      : "text-slate-300 hover:bg-white/[0.06] hover:text-slate-100"
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} role="menuitem">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes} role="menuitem">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </button>
  );
}
