"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DISCONNECTED,
  WalletError,
  adoptInjectedAddress,
  connect as connectWallet,
  disconnect as disconnectWallet,
  getConfiguredChainId,
  getInjectedProviderName,
  restore,
  rotateSessionAccount,
  subscribeToInjectedAvailability,
  subscribeToProvider,
  type ConnectorKind,
  type WalletSnapshot,
} from "@/lib/wallet";
import { useToast } from "@/components/ui/Toast";

interface WalletContextValue extends WalletSnapshot {
  /** Convenience flags derived from `status`, so consumers never compare strings. */
  isConnected: boolean;
  isConnecting: boolean;
  /** True until the initial silent restore has settled. */
  isRestoring: boolean;
  /** True when the connected chain differs from the configured one. */
  isWrongChain: boolean;
  hasInjected: boolean;
  /** Display name of the detected wallet, e.g. "MetaMask". */
  injectedName: string;
  connect: (kind: ConnectorKind) => Promise<void>;
  /** Disconnect the current connector and connect another in one step. */
  switchConnector: (kind: ConnectorKind) => Promise<void>;
  disconnect: (options?: { forgetSessionKey?: boolean }) => void;
  rotate: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<WalletSnapshot>(DISCONNECTED);
  const [isRestoring, setIsRestoring] = useState(true);
  const [hasInjected, setHasInjected] = useState(false);
  const [injectedName, setInjectedName] = useState("Browser wallet");
  const { toast } = useToast();

  // Guards every setState that follows an await, so an unmount mid-connect
  // cannot warn or write into a dead tree.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Provider detection must run on the client and must stay live.
  //
  // A one-shot probe on mount is the bug this replaces: extensions inject
  // asynchronously, so the probe often runs before MetaMask exists and never
  // re-checks, permanently hiding the wallet option. This subscription covers
  // EIP-6963 announcements, the legacy init event, and a bounded poll.
  useEffect(() => {
    return subscribeToInjectedAvailability((available) => {
      setHasInjected(available);
      if (available) setInjectedName(getInjectedProviderName());
    });
  }, []);

  // ----------------------------------------------------------------------- //
  // Silent restore on mount.
  //
  // Never prompts. For the injected connector this reads already-authorized
  // accounts only, so a user who revoked access returns disconnected instead of
  // seeing a stale address.
  // ----------------------------------------------------------------------- //
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await restore();
      if (cancelled || !mounted.current) return;
      if (restored) setSnapshot(restored);
      setIsRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ----------------------------------------------------------------------- //
  // Injected provider events.
  //
  // Only meaningful while the injected connector is active: a session wallet is
  // unaffected by what the extension does.
  // ----------------------------------------------------------------------- //
  useEffect(() => {
    if (snapshot.connector !== "injected") return;

    return subscribeToProvider({
      onAccountsChanged: (accounts) => {
        if (!mounted.current) return;
        if (accounts.length === 0) {
          // The user disconnected this site from inside the wallet.
          disconnectWallet();
          setSnapshot(DISCONNECTED);
          toast({
            tone: "info",
            title: "Wallet disconnected",
            description: "Access was revoked from your wallet extension.",
          });
          return;
        }
        const next = accounts[0] as `0x${string}`;
        adoptInjectedAddress(next);
        setSnapshot((current) => ({ ...current, address: next }));
        toast({ tone: "info", title: "Account switched" });
      },
      onChainChanged: (chainId) => {
        if (!mounted.current) return;
        setSnapshot((current) => ({ ...current, chainId }));
      },
    });
  }, [snapshot.connector, toast]);

  // ----------------------------------------------------------------------- //
  // Actions
  // ----------------------------------------------------------------------- //
  const connect = useCallback(
    async (kind: ConnectorKind) => {
      setSnapshot((current) => ({ ...current, status: "connecting" }));
      try {
        const next = await connectWallet(kind);
        if (!mounted.current) return;
        setSnapshot(next);
        toast({
          tone: "success",
          title: "Wallet connected",
          description:
            kind === "session"
              ? "Session wallet ready. Keys stay in this browser."
              : "Connected through your wallet extension.",
        });
      } catch (error) {
        if (!mounted.current) return;
        setSnapshot(DISCONNECTED);

        // Map to human copy by code. A rejected prompt is normal behavior and
        // is reported as info, not as an error the user must act on.
        const walletError =
          error instanceof WalletError
            ? error
            : new WalletError("UNKNOWN", "Wallet connection failed.");

        if (walletError.code === "USER_REJECTED") {
          toast({ tone: "info", title: "Connection cancelled" });
          return;
        }
        if (walletError.code === "REQUEST_PENDING") {
          toast({
            tone: "info",
            title: "Check your wallet",
            description: "A connection request is already open.",
          });
          return;
        }
        if (walletError.code === "NO_PROVIDER") {
          toast({
            tone: "error",
            title: "No wallet extension found",
            description: "Use the session wallet instead - it needs no extension.",
          });
          return;
        }
        toast({
          tone: "error",
          title: "Connection failed",
          description: walletError.message,
        });
      }
    },
    [toast]
  );

  const disconnect = useCallback(
    (options: { forgetSessionKey?: boolean } = {}) => {
      // Synchronous and total: state resets in the same tick the user clicks,
      // so the navbar swaps back to "Connect wallet" with no intermediate frame.
      disconnectWallet(options);
      setSnapshot(DISCONNECTED);
      toast({
        tone: "info",
        title: options.forgetSessionKey ? "Session wallet erased" : "Wallet disconnected",
        description: options.forgetSessionKey
          ? "A new address will be created next time you connect."
          : undefined,
      });
    },
    [toast]
  );

  /**
   * Switch connectors in one action.
   *
   * Drops the current client first so a failed or rejected switch cannot leave
   * the UI showing the old address while the client points somewhere else. The
   * session key is deliberately kept, so switching back returns the same
   * address.
   */
  const switchConnector = useCallback(
    async (kind: ConnectorKind) => {
      disconnectWallet();
      setSnapshot(DISCONNECTED);
      await connect(kind);
    },
    [connect]
  );

  const rotate = useCallback(() => {
    try {
      const next = rotateSessionAccount();
      setSnapshot(next);
      toast({
        tone: "success",
        title: "New session address",
        description: "The previous session key was discarded.",
      });
    } catch {
      toast({ tone: "error", title: "Could not rotate the session account" });
    }
  }, [toast]);

  const value = useMemo<WalletContextValue>(() => {
    const configuredChainId = getConfiguredChainId();
    return {
      ...snapshot,
      isConnected: snapshot.status === "connected",
      isConnecting: snapshot.status === "connecting",
      isRestoring,
      isWrongChain:
        snapshot.status === "connected" &&
        snapshot.chainId !== null &&
        snapshot.chainId !== configuredChainId,
      hasInjected,
      injectedName,
      connect,
      switchConnector,
      disconnect,
      rotate,
    };
  }, [
    snapshot,
    isRestoring,
    hasInjected,
    injectedName,
    connect,
    switchConnector,
    disconnect,
    rotate,
  ]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
