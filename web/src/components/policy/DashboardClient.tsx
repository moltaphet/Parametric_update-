"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WalletPanel } from "@/components/wallet/WalletPanel";
import { BuyPolicyForm } from "./BuyPolicyForm";
import { FundPoolCard } from "./FundPoolCard";
import { PolicyList } from "./PolicyList";
import { useContractStats } from "@/hooks/useContractStats";

/**
 * Dashboard client shell.
 *
 * Owns the two pieces of state the panels share: a refresh counter bumped after
 * any successful write, and the pool stats that BuyPolicyForm needs for its
 * pre-flight capacity check. Stats are fetched once here rather than in each
 * child so a refresh cannot leave two panels disagreeing about the pool.
 */
export function DashboardClient() {
  const [refreshToken, setRefreshToken] = useState(0);
  const { data: stats, refresh: refreshStats } = useContractStats();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    []
  );

  /**
   * Refresh after a write, then again on a short schedule.
   *
   * A single refresh at FINALIZED is not enough: the read node can still be
   * a moment behind consensus, so `get_stats().policies_created` comes back at
   * its pre-write value and the list renders empty even though the policy
   * exists. Re-reading a few times over ~15s closes that window without
   * hammering a shared, rate-limited network.
   */
  const handleWrite = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    const refreshAll = () => {
      setRefreshToken((token) => token + 1);
      refreshStats();
    };

    refreshAll();
    timers.current = [2000, 5000, 10000, 15000].map((delay) =>
      setTimeout(refreshAll, delay)
    );
  }, [refreshStats]);

  const unreservedAtto = stats?.unreserved_available_atto ?? null;

  return (
    <div className="space-y-6">
      <WalletPanel />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <BuyPolicyForm onCreated={handleWrite} unreservedAtto={unreservedAtto} />
          <FundPoolCard unreservedAtto={unreservedAtto} onFunded={handleWrite} />
        </div>
        <PolicyList refreshToken={refreshToken} />
      </div>
    </div>
  );
}
