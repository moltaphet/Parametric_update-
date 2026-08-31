"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, ExternalLink, Loader2 } from "lucide-react";
import type { TxState } from "@/hooks/useTransaction";
import { explorerUrl } from "@/lib/contract";
import { cn } from "@/lib/utils";

/**
 * Consensus pipeline visualizer.
 *
 * GenLayer settlement is slow enough that a bare spinner reads as a hang - the
 * evaluate path runs a live web render plus an LLM under consensus and can take
 * minutes. Showing which checkpoint is in progress is what makes the wait
 * legible rather than alarming.
 */
const STEPS = [
  { key: "signing", label: "Sign" },
  { key: "submitted", label: "Submit" },
  { key: "accepted", label: "Accepted" },
  { key: "finalized", label: "Finalized" },
] as const;

const ORDER: Record<string, number> = {
  preparing: -1,
  signing: 0,
  submitted: 1,
  accepted: 2,
  finalized: 3,
};

export function TxProgress({ state }: { state: TxState }) {
  if (state.stage === "idle") return null;

  const isError = state.stage === "error";
  const current = ORDER[state.stage] ?? -1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="overflow-hidden"
      >
        <div
          className={cn(
            "rounded-xl border p-4",
            isError
              ? "border-status-failed/25 bg-status-failed/5"
              : "border-white/[0.08] bg-white/[0.02]"
          )}
          role="status"
          aria-live="polite"
        >
          {isError ? (
            <div className="flex items-start gap-2.5">
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-status-failed"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100">
                  Transaction failed
                </p>
                <p className="mt-1 break-words text-xs leading-relaxed text-slate-400">
                  {state.error}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5">
                {state.busy ? (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-accent-400"
                    aria-hidden
                  />
                ) : (
                  <Check className="h-4 w-4 shrink-0 text-status-paid" aria-hidden />
                )}
                <p className="text-sm text-slate-200">{state.message}</p>
              </div>

              {/* Checkpoint rail */}
              <div className="mt-4 flex items-center gap-1.5">
                {STEPS.map((step, index) => {
                  const done = current > index;
                  const active = current === index;
                  return (
                    <div key={step.key} className="flex flex-1 flex-col gap-1.5">
                      <div
                        className={cn(
                          "h-0.5 rounded-full transition-colors duration-500",
                          done && "bg-status-paid",
                          active && "bg-accent-400",
                          !done && !active && "bg-white/10"
                        )}
                      />
                      <span
                        className={cn(
                          "text-[10px] transition-colors duration-500",
                          done && "text-status-paid",
                          active && "text-accent-300",
                          !done && !active && "text-slate-600"
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {state.hash && (
            <a
              href={explorerUrl("tx", state.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px]
                         text-slate-500 transition-colors hover:text-accent-300"
            >
              {state.hash.slice(0, 10)}...{state.hash.slice(-8)}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
