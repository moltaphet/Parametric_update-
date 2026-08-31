"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * The coverage timeline, which is the single most important thing a buyer has
 * to understand before purchasing: when they may buy, when they may claim, and
 * when the premium becomes recoverable.
 *
 * The constants are mirrored from the contract rather than fetched, so this
 * section renders instantly and identically for every visitor. `get_coverage_terms()`
 * is the authoritative source and is linked for anyone who wants to verify it.
 */
const PHASES = [
  {
    marker: "Buy",
    window: "Up to 24h before departure",
    body:
      "Coverage must be bought before the risk is knowable. Inside the cutoff a delay is often already announced, so the contract refuses the sale.",
    tone: "accent",
  },
  {
    marker: "Cutoff",
    window: "24h before departure",
    body:
      "The last insurable instant. Past this point create_policy() reverts, including for a flight that has already departed.",
    tone: "muted",
  },
  {
    marker: "Claim",
    window: "Departure to +7 days",
    body:
      "The claim window opens at departure, because a delay is not observable before the flight, and stays open for seven days while evidence is fresh.",
    tone: "accent",
  },
  {
    marker: "Expire",
    window: "After +7 days",
    body:
      "An unresolved policy can be cleaned up by anyone. The premium is always credited to the holder, never to the caller who performs cleanup.",
    tone: "muted",
  },
] as const;

export function CoverageTimeline() {
  return (
    <section
      id="coverage"
      className="relative scroll-mt-24 border-y border-white/[0.06] bg-obsidian-900/40"
    >
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
            Every bound is <span className="text-gradient">derived</span>
          </h2>
          <p className="mt-4 text-pretty text-slate-400">
            No caller supplies, widens, or skips a deadline. All four boundaries
            below are computed from the scheduled departure time.
          </p>
        </motion.div>

        <ol className="mt-16 grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          {PHASES.map((phase, index) => (
            <motion.li
              key={phase.marker}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{
                duration: 0.6,
                delay: index * 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="relative px-5 py-7 sm:px-6"
            >
              {/* Connector rail, drawn from each marker toward the next.
                  Suppressed on the final item so the line terminates at the
                  last marker instead of running off the grid. The check is on
                  the index rather than a `last:` variant: this div is the first
                  child of the li, so `last:` would never match it. */}
              {index < PHASES.length - 1 && (
                <div
                  className="absolute left-5 top-[38px] hidden h-px w-full bg-gradient-to-r
                             from-accent-400/40 to-transparent lg:block"
                  aria-hidden
                />
              )}

              <div className="relative flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-3 w-3 shrink-0 rounded-full ring-4",
                    phase.tone === "accent"
                      ? "bg-accent-400 ring-accent-400/15 shadow-[0_0_16px_var(--color-accent-400)]"
                      : "bg-slate-600 ring-slate-600/15"
                  )}
                  aria-hidden
                />
                <span className="text-sm font-semibold tracking-tight text-slate-100">
                  {phase.marker}
                </span>
              </div>

              <p className="mt-3 font-mono text-xs text-accent-300/80">
                {phase.window}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                {phase.body}
              </p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
