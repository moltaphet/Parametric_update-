"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useWallet } from "@/context/wallet";
import { getAllPolicies, type PolicyRecord } from "@/lib/contract";
import { STATUS_META, type PolicyStatus } from "@/lib/coverage";
import { formatGen } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The connected account's policies.
 *
 * Filtered client-side by holder because the contract exposes no per-holder
 * index; `getAllPolicies` walks ids and tolerates individual read failures.
 * That is fine at this scale and is the honest tradeoff to note if the pool
 * ever grows large - it is O(policies) reads per refresh.
 */
export function PolicyList({ refreshToken }: { refreshToken: number }) {
  const wallet = useWallet();
  const [policies, setPolicies] = useState<PolicyRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Monotonic request id. The post-write refresh schedule fires several loads a
  // few seconds apart, so multiple `getAllPolicies` calls are legitimately in
  // flight at once. Without this guard a slow earlier response can land after a
  // faster later one and overwrite fresher data - which shows up as the list
  // snapping back to its pre-purchase state. Only the newest request may write.
  const latestRequest = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!wallet.address) {
      setPolicies(null);
      return;
    }

    const requestId = ++latestRequest.current;
    const holder = wallet.address.toLowerCase();

    setLoading(true);
    setError(null);
    try {
      const all = await getAllPolicies();
      if (!mounted.current || requestId !== latestRequest.current) return;
      setPolicies(all.filter((policy) => policy.holder?.toLowerCase() === holder));
    } catch {
      if (!mounted.current || requestId !== latestRequest.current) return;
      setError("Could not read policies from the contract.");
    } finally {
      // Only the newest request owns the spinner; an outrun request clearing it
      // would hide the fact that a fresher load is still running.
      if (mounted.current && requestId === latestRequest.current) {
        setLoading(false);
      }
    }
  }, [wallet.address]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  if (!wallet.isConnected) {
    return (
      <div className="glass flex min-h-[220px] items-center justify-center rounded-2xl p-6 text-center">
        <p className="max-w-xs text-sm text-slate-500">
          Connect a wallet to see the policies held by your address.
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-slate-100">Your policies</h2>
          <p className="mt-1 text-sm text-slate-500">
            {policies === null
              ? " "
              : `${policies.length} held by this address`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/[0.05]
                     hover:text-slate-200 disabled:opacity-50"
          aria-label="Refresh policies"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
        </button>
      </div>

      <div className="mt-5">
        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-status-failed/5 px-3 py-3 text-xs text-status-failed">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {error}
          </div>
        ) : policies === null && loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-accent-400" aria-hidden />
            Loading policies...
          </div>
        ) : policies && policies.length === 0 ? (
          <div className="py-10 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-slate-700" aria-hidden />
            <p className="mt-3 text-sm text-slate-500">
              No policies yet. Buy coverage to get started.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {policies?.map((policy) => {
              const meta =
                STATUS_META[policy.status as PolicyStatus] ??
                STATUS_META.ACTIVE;
              return (
                <li
                  key={policy.policy_id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-100">
                        {policy.flight_number}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {policy.departure_time}
                      </p>
                    </div>
                    <span className={cn("shrink-0 text-xs font-medium", meta.color)}>
                      {meta.label}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <dt className="text-slate-600">Premium</dt>
                      <dd className="mt-0.5 font-mono text-slate-300">
                        {formatGen(policy.premium_atto)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">Threshold</dt>
                      <dd className="mt-0.5 font-mono text-slate-300">
                        {policy.delay_threshold_mins}m
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">Payout</dt>
                      <dd
                        className={cn(
                          "mt-0.5 font-mono",
                          Number(policy.payout_atto) > 0
                            ? "text-status-paid"
                            : "text-slate-300"
                        )}
                      >
                        {formatGen(policy.payout_atto)}
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
