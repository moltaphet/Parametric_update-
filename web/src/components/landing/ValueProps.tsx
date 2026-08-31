"use client";

import { motion } from "framer-motion";
import { Clock, Coins, Eye, Lock, ScanSearch, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

/**
 * Value propositions.
 *
 * Every claim here maps to an enforced mechanism in the contract rather than to
 * marketing copy, so the section stays true if the contract is audited against
 * it. The referenced method is named in each card for exactly that reason.
 */
const PROPS = [
  {
    icon: ScanSearch,
    title: "Evidence, not attestation",
    body:
      "Validators independently render the flight-status page and extract the delay themselves. Nobody submits a result the chain has to trust.",
    ref: "evaluate_claim()",
  },
  {
    icon: Lock,
    title: "Sources you cannot forge",
    body:
      "Claims are only judged against an allowlist of authoritative trackers. The payout beneficiary can pick which trusted source to cite, never whether a source is trusted.",
    ref: "is_trusted_url()",
  },
  {
    icon: Clock,
    title: "Bounded by design",
    body:
      "Coverage closes 24 hours before departure and claims close 7 days after. Both bounds are derived from the flight time and cannot be set by any caller.",
    ref: "get_coverage_terms()",
  },
  {
    icon: Coins,
    title: "Exact-wei settlement",
    body:
      "Payouts are integer multiples of the premium, transferred natively the moment consensus lands. No rounding, no oracle price, no discretion.",
    ref: "SETTLED_PAID",
  },
  {
    icon: ShieldCheck,
    title: "Always solvent",
    body:
      "Each policy locks its worst-case exposure on purchase. The insurer can only ever withdraw capital that is not backing a live policy.",
    ref: "withdraw_unreserved_liquidity()",
  },
  {
    icon: Eye,
    title: "Fails closed",
    body:
      "Ambiguous or broken evidence reverts and leaves the claim retryable. If it can never settle, the premium is recoverable after the window shuts.",
    ref: "expire_stale_claim()",
  },
] as const;

export function ValueProps() {
  return (
    <section
      id="how-it-works"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto max-w-2xl text-center"
      >
        <h2 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
          Parametric, <span className="text-gradient">end to end</span>
        </h2>
        <p className="mt-4 text-pretty text-slate-400">
          Every guarantee below is enforced by the deployed contract, not by a
          policy document. The method that enforces it is named on each card.
        </p>
      </motion.div>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PROPS.map((prop, index) => {
          const Icon = prop.icon;
          return (
            <GlassCard key={prop.title} index={index} interactive className="group">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl
                           bg-accent-400/10 text-accent-400 ring-1 ring-accent-400/20
                           transition-colors duration-500 group-hover:bg-accent-400/15"
              >
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-5 text-lg font-medium text-slate-100">
                {prop.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
                {prop.body}
              </p>
              <code
                className="mt-4 inline-block rounded-md bg-white/[0.04] px-2 py-1
                           font-mono text-xs text-accent-300/80"
              >
                {prop.ref}
              </code>
            </GlassCard>
          );
        })}
      </div>
    </section>
  );
}
