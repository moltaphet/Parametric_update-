"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
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
 * Wallet entry point for the navbar.
 *
 * Renders one of three states:
 *   restoring  - a skeleton, so a returning user never sees "Connect wallet"
 *                flash before their session is restored;
 *   connected  - the truncated address plus an account menu;
 *   otherwise  - a connect control, offering the injected wallet only when a
 *                provider is actually present.
 */
export function ConnectButton({ className }: { className?: string }) {
  const wallet = useWallet();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close either popover on outside click or Escape.
  useEffect(() => {
    if (!menuOpen && !pickerOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setPickerOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, pickerOpen]);

  // Reset the transient "copied" tick.
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
      // Clipboard is permission-gated and blocked in some embedded contexts.
      toast({ tone: "error", title: "Could not copy address" });
    }
  }

  async function handleConnect(kind: "session" | "injected") {
    setPickerOpen(false);
    await wallet.connect(kind);
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
                  {wallet.connector === "session" ? "Session wallet" : "Browser wallet"}
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
                <div
                  className="mx-1 mb-1 flex items-start gap-2 rounded-lg border
                             border-status-pending/25 bg-status-pending/5 px-3 py-2"
                >
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-pending"
                    aria-hidden
                  />
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    Your wallet is on a different network than this app. Switch
                    networks before sending a transaction.
                  </p>
                </div>
              )}

              <div className="h-px bg-white/[0.06]" />

              <MenuItem onClick={copyAddress} icon={copied ? Check : Copy}>
                {copied ? "Copied" : "Copy address"}
              </MenuItem>

              <MenuItem
                href={explorerUrl("address", wallet.address)}
                icon={ExternalLink}
              >
                View on explorer
              </MenuItem>

              {wallet.connector === "session" && (
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    wallet.rotate();
                  }}
                  icon={RefreshCw}
                >
                  New session address
                </MenuItem>
              )}

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
  // With no extension present there is only one real choice, so skip the picker
  // entirely and connect the session wallet directly.
  if (!wallet.hasInjected) {
    return (
      <Button
        size="sm"
        onClick={() => handleConnect("session")}
        disabled={wallet.isConnecting}
        className={className}
      >
        {wallet.isConnecting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Connecting
          </>
        ) : (
          <>
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            Connect wallet
          </>
        )}
      </Button>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Button
        size="sm"
        onClick={() => setPickerOpen((open) => !open)}
        disabled={wallet.isConnecting}
        aria-expanded={pickerOpen}
        aria-haspopup="menu"
      >
        {wallet.isConnecting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Connecting
          </>
        ) : (
          <>
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            Connect wallet
          </>
        )}
      </Button>

      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong absolute right-0 z-50 mt-2 w-72 rounded-xl p-2 shadow-xl"
            role="menu"
          >
            <ConnectorOption
              title="Session wallet"
              description="No extension needed. Keys stay in this browser."
              recommended
              onClick={() => handleConnect("session")}
            />
            <ConnectorOption
              title="Browser wallet"
              description="Requires the GenLayer Snap for signing on Studio networks."
              onClick={() => handleConnect("injected")}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Local presentational pieces
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
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        role="menuitem"
      >
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

function ConnectorOption({
  title,
  description,
  onClick,
  recommended,
}: {
  title: string;
  description: string;
  onClick: () => void;
  recommended?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col items-start gap-1 rounded-lg px-3 py-3 text-left
                 transition-colors hover:bg-white/[0.06]"
      role="menuitem"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
        {title}
        {recommended && (
          <span className="rounded bg-accent-400/10 px-1.5 py-0.5 text-[10px] font-normal text-accent-300">
            Recommended
          </span>
        )}
      </span>
      <span className="text-xs leading-relaxed text-slate-500">{description}</span>
    </button>
  );
}
