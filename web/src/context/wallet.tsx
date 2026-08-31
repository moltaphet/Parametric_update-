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
  adoptAddress,
  connectInjected,
  connectSession,
  disconnect as disconnectWallet,
  getConfiguredChainId,
  listWallets,
  restore,
  subscribeToActiveProvider,
  subscribeToWallets,
  switchToStudioNet,
  type WalletOption,
  type WalletSnapshot,
} from "@/lib/wallet";
import { useToast } from "@/components/ui/Toast";

interface WalletContextValue extends WalletSnapshot {
  isConnected: boolean;
  isConnecting: boolean;
  /** True until the initial silent restore has settled. */
  isRestoring: boolean;
  isWrongChain: boolean;
  /** Every detected extension. Empty when none is installed. */
  wallets: WalletOption[];
  /** Connect an extension. Pass an id when more than one is installed. */
  connect: (walletId?: string) => Promise<void>;
  /** In-browser fallback, offered only when no extension exists. */
  connectFallback: () => void;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<WalletSnapshot>(DISCONNECTED);
  const [isRestoring, setIsRestoring] = useState(true);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const { toast } = useToast();

  // Guards state writes that follow an await, so unmounting mid-connect cannot
  // write into a dead tree.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Extensions inject asynchronously, so this is event-driven rather than a
  // single probe on mount.
  useEffect(() => subscribeToWallets((next) => setWallets(next)), []);

  // Silent restore. Never prompts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Give wallets a tick to announce before deciding nothing is installed.
      await new Promise((resolve) => setTimeout(resolve, 120));
      const restored = await restore();
      if (cancelled || !mounted.current) return;
      if (restored) setSnapshot(restored);
      setIsRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Account and chain events, bound to the connected provider only.
  useEffect(() => {
    if (snapshot.status !== "connected" || snapshot.kind !== "injected") return;

    return subscribeToActiveProvider({
      onAccountsChanged: (accounts) => {
        if (!mounted.current) return;
        if (accounts.length === 0) {
          disconnectWallet();
          setSnapshot(DISCONNECTED);
          toast({ tone: "info", title: "Wallet disconnected" });
          return;
        }
        const next = accounts[0] as `0x${string}`;
        adoptAddress(next);
        setSnapshot((current) => ({ ...current, address: next }));
      },
      onChainChanged: (chainId) => {
        if (!mounted.current) return;
        setSnapshot((current) => ({ ...current, chainId }));
      },
    });
  }, [snapshot.status, snapshot.kind, toast]);

  /**
   * One place where connection errors become user-facing text.
   *
   * Every failure path funnels through here and raises exactly one toast, which
   * is what stops a rejected prompt from cascading into several stacked errors.
   */
  const reportFailure = useCallback(
    (error: unknown) => {
      const walletError =
        error instanceof WalletError
          ? error
          : new WalletError("UNKNOWN", "Wallet connection failed.");

      switch (walletError.code) {
        case "USER_REJECTED":
          toast({ tone: "info", title: "Connection cancelled" });
          return;
        case "REQUEST_PENDING":
          toast({
            tone: "info",
            title: "Check your wallet",
            description: "A request is already open in the extension.",
          });
          return;
        case "NO_PROVIDER":
          toast({
            tone: "error",
            title: "No wallet detected",
            description: "Install a browser wallet, then reload this page.",
          });
          return;
        default:
          toast({
            tone: "error",
            title: "Could not connect",
            description: walletError.message,
          });
      }
    },
    [toast]
  );

  const connect = useCallback(
    async (walletId?: string) => {
      setSnapshot((current) => ({ ...current, status: "connecting" }));
      try {
        const next = await connectInjected(walletId);
        if (!mounted.current) return;
        setSnapshot(next);
        toast({
          tone: "success",
          title: "Connected",
          description: `${next.walletName} is connected.`,
        });
      } catch (error) {
        if (!mounted.current) return;
        setSnapshot(DISCONNECTED);
        reportFailure(error);
      }
    },
    [toast, reportFailure]
  );

  const connectFallback = useCallback(() => {
    try {
      setSnapshot(connectSession());
      toast({
        tone: "success",
        title: "Connected",
        description: "Using an in-browser wallet. Keys stay on this device.",
      });
    } catch (error) {
      setSnapshot(DISCONNECTED);
      reportFailure(error);
    }
  }, [toast, reportFailure]);

  const disconnect = useCallback(() => {
    // Synchronous, so the UI swaps back in the same tick with no in-between frame.
    disconnectWallet();
    setSnapshot(DISCONNECTED);
    toast({ tone: "info", title: "Disconnected" });
  }, [toast]);

  const switchNetwork = useCallback(async () => {
    try {
      await switchToStudioNet();
    } catch (error) {
      reportFailure(error);
    }
  }, [reportFailure]);

  const value = useMemo<WalletContextValue>(
    () => ({
      ...snapshot,
      isConnected: snapshot.status === "connected",
      isConnecting: snapshot.status === "connecting",
      isRestoring,
      isWrongChain:
        snapshot.status === "connected" &&
        snapshot.kind === "injected" &&
        snapshot.chainId !== null &&
        snapshot.chainId !== getConfiguredChainId(),
      wallets,
      connect,
      connectFallback,
      disconnect,
      switchNetwork,
    }),
    [snapshot, isRestoring, wallets, connect, connectFallback, disconnect, switchNetwork]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within a WalletProvider");
  return context;
}

/** Re-exported so components can render a wallet list without importing lib. */
export { listWallets };
