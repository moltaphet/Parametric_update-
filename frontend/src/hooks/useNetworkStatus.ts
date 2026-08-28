import { useEffect, useState } from "react";
import { getStats } from "@/lib/genlayer";

export type NetworkHealth = "checking" | "online" | "offline";

/**
 * Lightweight StudioNet health probe. Confirms the app can actually reach the
 * deployed contract by issuing a real view call, and re-checks periodically.
 */
export function useNetworkStatus(pollMs = 60000): NetworkHealth {
  const [status, setStatus] = useState<NetworkHealth>("checking");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function probe() {
      try {
        await getStats();
        if (!cancelled) setStatus("online");
      } catch {
        if (!cancelled) setStatus("offline");
      } finally {
        if (!cancelled) timer = window.setTimeout(probe, pollMs);
      }
    }

    probe();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [pollMs]);

  return status;
}
