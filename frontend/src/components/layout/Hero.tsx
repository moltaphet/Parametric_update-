import { ShieldCheck, Globe, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { COVERAGE } from "@/lib/contract-meta";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-aurora">
      <div className="absolute inset-0 card-grid-lines opacity-40" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-3xl">
          <Badge tone="accent" className="mb-5">
            <span className="size-1.5 rounded-full bg-accent" />
            GenLayer Intelligent Contract
          </Badge>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            Flight-delay insurance settled by{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              validator consensus
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Underwrite a policy before departure. When you claim a delay, GenLayer validators
            independently render an allowlisted flight-status page, extract the delay under a
            fenced prompt, and agree on a payout tier - no privileged claims adjuster.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Feature icon={<ShieldCheck className="size-4" />} text="Exact-wei native payouts" />
            <Feature
              icon={<Globe className="size-4" />}
              text="Allowlisted authoritative sources"
            />
            <Feature
              icon={<Scale className="size-4" />}
              text={`Tier payouts up to ${COVERAGE.tier2Multiplier}x premium`}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-sm text-foreground backdrop-blur">
      <span className="text-primary">{icon}</span>
      {text}
    </div>
  );
}
