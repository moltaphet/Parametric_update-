"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStats, type ContractStats } from "@/lib/contract";

export type StatsState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: ContractStats; error: null }
  | { status: "error"; data: null; error: string };

/**
 * Poll the contract's public stats view.
 *
 * The landing page must render immediately and must never look broken because a
 * shared, rate-limited network was slow, so this hook is deliberately forgiving:
 *
 *  - it starts in `loading` and the ticker shows skeletons, not zeros, so a slow
 *    read is never mistaken for a contract with no activity;
 *  - a failed refresh keeps the last good data on screen rather than flipping
 *    the whole section to an error state;
 *  - polling pauses while the tab is hidden, which matters on StudioNet.
 */
export function useContractStats(pollMs = 30_000): StatsState & {
  refresh: () => void;
} {
  const [state, setState] = useState<StatsState>({
    status: "loading",
    data: null,
    error: null,
  });

  // Guards a state update after unmount, and lets a failed refresh check
  // whether it already has good data to fall back on.
  const mounted = useRef(true);
  const lastGood = useRef<ContractStats | null>(null);
  // The 30s poll and the post-write refresh schedule can overlap, so responses
  // are not guaranteed to arrive in request order. Only the newest may write;
  // otherwise a slow earlier read can clobber fresher pool figures, which feed
  // the purchase capacity check.
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    try {
      const data = await getStats();
      if (!mounted.current || requestId !== latestRequest.current) return;
      lastGood.current = data;
      setState({ status: "ready", data, error: null });
    } catch (error) {
      if (!mounted.current || requestId !== latestRequest.current) return;
      // Keep showing the last successful read; a transient RPC failure should
      // not blank out the page.
      if (lastGood.current) {
        setState({ status: "ready", data: lastGood.current, error: null });
        return;
      }
      setState({
        status: "error",
        data: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to reach the GenLayer network",
      });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();

    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    }, pollMs);

    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [load, pollMs]);

  return { ...state, refresh: load };
}
