"use client";

import { ToastProvider } from "@/components/ui/Toast";
import { WalletProvider } from "@/context/wallet";

/**
 * Client provider tree.
 *
 * Isolated from `layout.tsx` so the root layout stays a server component and
 * keeps its metadata and font exports. Only this subtree ships to the client.
 *
 * Order matters: WalletProvider calls `useToast` to report connection outcomes,
 * so ToastProvider has to be the outer one.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <WalletProvider>{children}</WalletProvider>
    </ToastProvider>
  );
}
