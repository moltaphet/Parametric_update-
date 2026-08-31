"use client";

import { motion } from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { CONTRACT_ADDRESS, NETWORK, explorerUrl } from "@/lib/contract";
import { shortenAddress } from "@/lib/format";

export function CtaBand() {
  return (
    <section className="relative mx-auto max-w-6xl px-5 pb-28 sm:px-8">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="glass-strong relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-14 sm:py-20"
      >
        {/* Bloom anchored to the band's own top edge. */}
        <div
          className="bloom pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px]
                     -translate-x-1/2 -translate-y-1/2 opacity-50"
          aria-hidden
        />

        <div className="relative">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
            Insure a flight in <span className="text-gradient">under a minute</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-slate-400">
            Connect a session wallet, pick a flight at least 24 hours out, and
            set your delay threshold. The contract handles the rest.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/dashboard" size="lg" className="w-full sm:w-auto">
              Launch app
              <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <ButtonLink
              href={explorerUrl("address", CONTRACT_ADDRESS)}
              variant="secondary"
              size="lg"
              external
              className="w-full sm:w-auto"
            >
              View contract
              <ExternalLink className="h-4 w-4" aria-hidden />
            </ButtonLink>
          </div>

          <p className="mt-8 font-mono text-xs text-slate-500">
            {NETWORK} - {shortenAddress(CONTRACT_ADDRESS)}
          </p>
        </div>
      </motion.div>
    </section>
  );
}
