import * as React from "react";
import {
  connectWallet,
  disconnectWallet,
  rotateAccount,
  hasStoredKey,
  getAccountAddress,
  isConnected,
} from "@/lib/genlayer";

interface WalletContextValue {
  account: string | null;
  connected: boolean;
  connect: () => string;
  disconnect: () => void;
  rotate: () => string;
}

const WalletContext = React.createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState(false);

  // Auto-restore a prior session so returning users stay connected, while
  // first-time visitors start disconnected and see an explicit Connect action.
  React.useEffect(() => {
    if (!isConnected() && hasStoredKey()) {
      const addr = connectWallet();
      setAccount(addr);
      setConnected(true);
    } else if (isConnected()) {
      setAccount(getAccountAddress());
      setConnected(true);
    }
  }, []);

  const connect = React.useCallback(() => {
    const addr = connectWallet();
    setAccount(addr);
    setConnected(true);
    return addr;
  }, []);

  const disconnect = React.useCallback(() => {
    disconnectWallet();
    setAccount(null);
    setConnected(false);
  }, []);

  const rotate = React.useCallback(() => {
    const addr = rotateAccount();
    setAccount(addr);
    setConnected(true);
    return addr;
  }, []);

  const value = React.useMemo(
    () => ({ account, connected, connect, disconnect, rotate }),
    [account, connected, connect, disconnect, rotate]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = React.useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
