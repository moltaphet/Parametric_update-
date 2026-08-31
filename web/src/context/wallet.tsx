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
  subscribeToInjectedAvailability,
  subscribeToProvider,
  switchToStudioNet,
  type WalletSnapshot,
} from "@/lib/wallet";
import { useToast } from "@/components/ui/Toast";

interface WalletContextValue extends WalletSnapshot {
  /** Derived from `status`, so consumers never compare strings. */
  isConnected: boolean;
  isConnecting: boolean;
  /** True until the initial silent restore has settled. */
  isRestoring: boolean;
  /** True when MetaMask is on a different chain than the app targets. */
  isWrongChain: boolean;
  /** True once an injected provider has been detected. */
  hasInjected: boolean;
  /** Display name of the detected wallet, e.g. "MetaMask". */
  injectedName: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Ask MetaMask to switch back to StudioNet. */
  switchNetwork: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<WalletSnapshot>(DISCONNECTED);
  const [isRestoring, setIsRestoring] = useState(true);
  const [hasInjected, setHasInjected] = useState(false);
  const [injectedName, setInjectedName] = useState("MetaMask");
  const { toast } = useToast();

  // Guards every setState that follows an await, so an unmount mid-connect
  // cannot write into a dead tree.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Provider detection must run on the client and must stay live: extensions
  // inject asynchronously, so a one-shot probe on mount frequently runs before
  // MetaMask exists and would then hide the connect option for good.
  useEffect(() => {
    return subscribeToInjectedAvailability((available) => {
      setHasInjected(available);
      if (available) setInjectedName(getInjectedProviderName());
    });
  }, []);

  // Silent restore. Never prompts: it only re-checks already-granted
  // authorization, so revoking access in MetaMask returns the user disconnected
  // rather than showing a stale address.
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

  // Account and chain changes from the extension.
  useEffect(() => {
    if (snapshot.status !== "connected") return;

    return subscribeToProvider({
      onAccountsChanged: (accounts) => {
        if (!mounted.current) return;
        if (accounts.length === 0) {
          // The user disconnected this site from inside MetaMask.
          disconnectWallet();
          setSnapshot(DISCONNECTED);
          toast({
            tone: "info",
            title: "Wallet disconnected",
            description: "Access was revoked from MetaMask.",
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
  }, [snapshot.status, toast]);

  const connect = useCallback(async () => {
    setSnapshot((current) => ({ ...current, status: "connecting" }));
    try {
      const next = await connectWallet();
      if (!mounted.current) return;
      setSnapshot(next);
      toast({
        tone: "success",
        title: "Wallet connected",
        description: "MetaMask is connected to GenLayer StudioNet.",
      });
    } catch (error) {
      if (!mounted.current) return;
      setSnapshot(DISCONNECTED);

      const walletError =
        error instanceof WalletError
          ? error
          : new WalletError("UNKNOWN", "MetaMask connection failed.");

      // Map to human copy by code. A rejected prompt is normal behavior and is
      // reported as info, not as an error the user must act on.
      switch (walletError.code) {
        case "USER_REJECTED":
          toast({ tone: "info", title: "Connection cancelled" });
          return;
        case "REQUEST_PENDING":
          toast({
            tone: "info",
            title: "Check MetaMask",
            description: "A request is already open in the extension.",
          });
          return;
        case "NO_PROVIDER":
          toast({
            tone: "error",
            title: "MetaMask not found",
            description: "Install the MetaMask extension, then reload this page.",
          });
          return;
        case "SNAP_UNSUPPORTED":
          toast({
            tone: "error",
            title: "Snaps not supported",
            description:
              "GenLayer signing needs MetaMask Snaps. Update MetaMask and try again.",
          });
          return;
        default:
          toast({
            tone: "error",
            title: "Connection failed",
            description: walletError.message,
          });
      }
    }
  }, [toast]);

  const disconnect = useCallback(() => {
    // Synchronous and total: state resets in the same tick the user clicks, so
    // the navbar swaps back with no intermediate frame.
    disconnectWallet();
    setSnapshot(DISCONNECTED);
    toast({
      tone: "info",
      title: "Wallet disconnected",
      description: "MetaMask still lists this site; revoke it there to fully remove access.",
    });
  }, [toast]);

  const switchNetwork = useCallback(async () => {
    try {
      await switchToStudioNet();
    } catch (error) {
      const description =
        error instanceof WalletError ? error.message : "Could not switch network.";
      toast({ tone: "error", title: "Network switch failed", description });
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
      disconnect,
      switchNetwork,
    };
  }, [snapshot, isRestoring, hasInjected, injectedName, connect, disconnect, switchNetwork]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
