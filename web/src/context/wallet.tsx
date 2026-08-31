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
  hasInjectedProvider,
  restore,
  rotateSessionAccount,
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
  connect: (kind: ConnectorKind) => Promise<void>;
  disconnect: (options?: { forgetSessionKey?: boolean }) => void;
  rotate: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<WalletSnapshot>(DISCONNECTED);
  const [isRestoring, setIsRestoring] = useState(true);
  const [hasInjected, setHasInjected] = useState(false);
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

  // Provider detection must run on the client: `window` does not exist during
  // the server render, and reading it during render would desync hydration.
  useEffect(() => {
    setHasInjected(hasInjectedProvider());
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
      connect,
      disconnect,
      rotate,
    };
  }, [snapshot, isRestoring, hasInjected, connect, disconnect, rotate]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
