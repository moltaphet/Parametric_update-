"use client";

import { Activity, AlertCircle } from "lucide-react";
import { useContractStats } from "@/hooks/useContractStats";
import { formatCompact, formatGen } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: string;
  suffix?: string;
}

/**
 * Live stats read from the deployed contract's `get_stats()` view.
 *
 * Deliberately shows skeletons rather than zeros while loading: a pool of
 * "0 GEN" reads as a dead contract, which is a materially different claim from
 * "we have not finished reading yet".
 */
export function StatsTicker() {
  const { status, data, error } = useContractStats();

  if (status === "error") {
    return (
      <div
        className="glass mx-auto flex max-w-md items-center justify-center gap-2
                   rounded-2xl px-5 py-4 text-sm text-slate-400"
        role="status"
      >
        <AlertCircle className="h-4 w-4 shrink-0 text-status-failed" aria-hidden />
        <span>Live stats unavailable. The contract is unaffected.</span>
      </div>
    );
  }

  const stats: Stat[] = data
    ? [
        { label: "Policies written", value: formatCompact(data.policies_created) },
        { label: "Claims settled", value: formatCompact(data.settled) },
        { label: "Total paid out", value: formatGen(data.total_paid_atto), suffix: "GEN" },
        { label: "Pool liquidity", value: formatGen(data.total_pool_balance_atto), suffix: "GEN" },
      ]
    : [];

  return (
    <div
      className="glass mx-auto grid max-w-4xl grid-cols-2 gap-px overflow-hidden
                 rounded-2xl md:grid-cols-4"
      role="status"
      aria-live="polite"
      aria-busy={status === "loading"}
    >
      {status === "loading"
        ? // Four placeholders matching the final layout, so the section does not
          // change height when data lands.
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="px-5 py-6 text-center sm:px-6">
              <div className="mx-auto h-7 w-20 animate-pulse rounded bg-white/10" />
              <div className="mx-auto mt-2.5 h-3 w-24 animate-pulse rounded bg-white/5" />
            </div>
          ))
        : stats.map((stat, index) => (
            <div
              key={stat.label}
              className={cn(
                "px-5 py-6 text-center transition-colors sm:px-6",
                "hover:bg-white/[0.03]",
                // Hairline separators without a wrapping border, using the
                // grid gap-px trick against the parent background.
                index > 0 && "border-l border-white/[0.06]",
                index === 2 && "border-l-0 md:border-l",
                index >= 2 && "border-t border-white/[0.06] md:border-t-0"
              )}
            >
              <div className="font-mono text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
                {stat.value}
                {stat.suffix && (
                  <span className="ml-1 text-sm font-normal text-accent-400">
                    {stat.suffix}
                  </span>
                )}
              </div>
              <div className="mt-1.5 text-xs tracking-wide text-slate-500 sm:text-sm">
                {stat.label}
              </div>
            </div>
          ))}

      {status === "ready" && (
        <span className="sr-only">
          <Activity aria-hidden /> Live contract statistics updated.
        </span>
      )}
    </div>
  );
}
