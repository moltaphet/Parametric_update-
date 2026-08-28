import {
  ShieldCheck,
  Globe,
  Scale,
  Cpu,
  FileSignature,
  Send,
  Users,
  Banknote,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { COVERAGE, CORE_TRUSTED_DOMAINS } from "@/lib/contract-meta";

const PILLARS = [
  {
    icon: <Cpu className="size-5" />,
    title: "Automated consensus execution",
    body: "There is no claims adjuster. GenLayer validators independently render an allowlisted flight-status page, extract the delay under a fenced prompt, and must agree on a payout tier before any funds move.",
  },
  {
    icon: <Globe className="size-5" />,
    title: "Trustless web verification",
    body: "GenLayer intelligent contracts read the live web and call language models on-chain while preserving deterministic consensus, so a payout is backed by real-world evidence, not a centralized oracle.",
  },
  {
    icon: <ShieldCheck className="size-5" />,
    title: "Solvent by construction",
    body: `Every policy locks its worst-case exposure of ${COVERAGE.tier2Multiplier}x the premium up front. A liquidity invariant is asserted on every state change, so the pool can always cover admissible claims.`,
  },
  {
    icon: <Scale className="size-5" />,
    title: "Parametric, not discretionary",
    body: "Payout tiers are fixed multiples of the premium, triggered purely by the observed delay. The rules are compiled into the contract and identical for everyone.",
  },
];

const STEPS = [
  {
    icon: <FileSignature className="size-5" />,
    title: "Underwrite",
    body: `Buy coverage for a flight at least ${COVERAGE.cutoffHours}h before departure. The premium is escrowed and worst-case exposure is reserved.`,
  },
  {
    icon: <Send className="size-5" />,
    title: "Claim",
    body: `After departure, cite a flight-status page from an allowlisted source within the ${COVERAGE.claimWindowDays}-day claim window.`,
  },
  {
    icon: <Users className="size-5" />,
    title: "Reach consensus",
    body: "Validators independently render the page and agree on the delay tier. Uncertain or tampered evidence fails closed.",
  },
  {
    icon: <Banknote className="size-5" />,
    title: "Settle",
    body: "A qualifying delay pays an exact-wei native transfer instantly. A not-found flight queues a full premium refund.",
  },
];

export function About() {
  return (
    <section id="about" className="scroll-mt-20 space-y-10">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">The protocol</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Decentralized parametric insurance, settled from live evidence
        </h2>
        <p className="mt-4 text-pretty text-muted-foreground">
          Parametric Insurance is a fully on-chain flight-delay product built as a GenLayer
          intelligent contract. Coverage terms, the source allowlist, and the payout math are all
          enforced by the deployed bytecode. When you claim a delay, the network itself verifies it
          against authoritative flight-status providers and settles automatically - no privileged
          intermediary can approve, deny, or reroute a payout.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PILLARS.map((p) => (
          <Card key={p.title} className="transition-colors hover:border-border/80">
            <CardContent className="flex gap-4 p-5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-accent">
                {p.icon}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{p.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.body}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* How it works flow */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          How a policy resolves
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <Card key={step.title} className="relative overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {step.icon}
                  </div>
                  <span className="font-mono text-3xl font-bold text-border">{i + 1}</span>
                </div>
                <h4 className="mt-3 text-sm font-semibold text-foreground">{step.title}</h4>
                <p className="mt-1 text-xs text-muted-foreground">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="bg-aurora">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Authoritative sources only</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              A claim URL is evaluated only if its host resolves, under strict parsing, to an
              allowlisted flight-status domain. The payout beneficiary can never widen that
              allowlist.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {CORE_TRUSTED_DOMAINS.map((d) => (
              <span
                key={d}
                className="rounded-full border border-border bg-card/70 px-3 py-1 font-mono text-xs text-foreground"
              >
                {d}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
