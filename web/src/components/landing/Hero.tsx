"use client";

import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/layout/Logo";
import { StatsTicker } from "./StatsTicker";

// The WebGL scene is client-only and pulls in three.js, so it is loaded on the
// client and kept out of the server bundle entirely. `ssr: false` is required
// rather than cosmetic: three touches `window` during module evaluation.
const HeroScene = dynamic(
  () => import("@/components/three/HeroScene").then((m) => m.HeroScene),
  { ssr: false }
);

const CONTAINER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
};

const ITEM = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
  },
};

export function Hero() {
  // Suppress the idle float for users who asked for less motion. The mark still
  // renders at full fidelity; only the loop is dropped.
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative min-h-[100svh] overflow-hidden">
      {/* --- Background stack, painted back to front ------------------------ */}
      <div className="grid-substrate absolute inset-0 opacity-40" aria-hidden />
      <div
        className="bloom pointer-events-none absolute left-1/2 top-1/3 h-[820px] w-[820px]
                   -translate-x-1/2 -translate-y-1/2 opacity-60 sm:h-[1100px] sm:w-[1100px]"
        aria-hidden
      />
      <HeroScene />
      {/* Vignette: darkens the frame edges so the headline keeps contrast over
          the 3D scene at every viewport size. */}
      <div
        className="pointer-events-none absolute inset-0
                   bg-[radial-gradient(ellipse_at_center,transparent_35%,var(--color-obsidian-950)_88%)]"
        aria-hidden
      />

      {/* --- Foreground ----------------------------------------------------- */}
      <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col items-center
                      justify-center px-5 pb-20 pt-28 text-center sm:px-8">
        {/* Text scrim. The emissive core sits directly behind the copy and was
            washing out the body paragraph; this pulls the backdrop down locally
            without dimming the rings or particles at the frame edges. */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[900px]
                     -translate-x-1/2 -translate-y-1/2
                     bg-[radial-gradient(ellipse_at_center,var(--color-obsidian-950)_25%,transparent_72%)]
                     opacity-80"
          aria-hidden
        />

        <motion.div
          variants={CONTAINER}
          initial="hidden"
          animate="show"
          className="relative"
        >
          {/* Brand mark, floating above the headline and in front of the WebGL
              scene. The art is transparency-keyed, so it reads as a lit object
              in the same space as the 3D node rather than a pasted-on tile. */}
          <motion.div variants={ITEM} className="flex justify-center">
            <motion.div
              animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
              transition={
                reduceMotion
                  ? undefined
                  : { duration: 7, repeat: Infinity, ease: "easeInOut" }
              }
            >
              <Logo
                className="h-24 w-24 sm:h-32 sm:w-32"
                sizes="(min-width: 640px) 128px, 96px"
                alt="Parametric"
                glow
                priority
              />
            </motion.div>
          </motion.div>

          <motion.div variants={ITEM} className="mt-7 flex justify-center">
            <span
              className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5
                         text-xs font-medium tracking-wide text-accent-300 sm:text-sm"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Settled by validator consensus, not a claims adjuster
            </span>
          </motion.div>

          <motion.h1
            variants={ITEM}
            className="mt-7 text-balance text-4xl font-semibold leading-[1.08] tracking-tight
                       sm:text-6xl lg:text-7xl"
          >
            <span className="text-gradient">Flight delay insurance</span>
            <br />
            <span className="text-slate-100">that pays itself out.</span>
          </motion.h1>

          <motion.p
            variants={ITEM}
            className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed
                       text-slate-400 sm:text-lg"
          >
            Buy coverage before departure. When a delay happens, GenLayer
            validators independently read the flight status from an allowlisted
            source and agree on the payout tier. No adjuster, no discretion, no
            appeal process.
          </motion.p>

          <motion.div
            variants={ITEM}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <ButtonLink href="/dashboard" size="lg" className="w-full sm:w-auto">
              Launch app
              <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <ButtonLink
              href="#how-it-works"
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
            >
              How it works
            </ButtonLink>
          </motion.div>
        </motion.div>

        {/* Live contract stats, read from the deployed contract. */}
        <motion.div
          variants={ITEM}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.55 }}
          className="relative mt-16 w-full sm:mt-20"
        >
          <StatsTicker />
        </motion.div>
      </div>
    </section>
  );
}
