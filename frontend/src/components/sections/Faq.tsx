import { HelpCircle } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { COVERAGE } from "@/lib/contract-meta";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How are payouts triggered?",
    a: `Payouts are parametric. After your flight, you submit a claim citing an allowlisted flight-status page. GenLayer validators render that page and agree on the observed delay. If the delay meets your threshold you receive Tier 1 (${COVERAGE.tier1Multiplier}x premium); a delay of three times your threshold or a cancellation pays Tier 2 (${COVERAGE.tier2Multiplier}x premium). A qualifying payout is sent as an exact-wei native transfer during evaluation - no manual approval.`,
  },
  {
    q: "What is GenLayer consensus?",
    a: "GenLayer is a blockchain whose validators can access the web and run language models while still reaching deterministic agreement. For each claim, a leader proposes a verdict and validators independently repeat the work; they must agree on the (verdict, tier) pair. Volatile page bytes and free-form model text are never compared directly, and uncertain or tampered evidence fails closed, leaving the claim retryable rather than paying out on bad data.",
  },
  {
    q: "How do I connect my wallet?",
    a: "Click Connect wallet in the top navigation. This session uses a lightweight browser account that is generated and stored locally so your policies persist across reloads. Use the account menu to copy your address, view it on the explorer, rotate to a fresh account, or disconnect - disconnecting clears the local signing provider. StudioNet is gasless, so a zero-balance account can still transact.",
  },
  {
    q: "When can I buy coverage and file a claim?",
    a: `Coverage must be purchased strictly before the cutoff: at least ${COVERAGE.cutoffHours} hours before departure, and no more than ${COVERAGE.maxAdvanceDays} days out. Claims are admissible only inside the derived window - from departure until ${COVERAGE.claimWindowDays} days afterwards. Both bounds are compiled into the contract and cannot be set by any caller.`,
  },
  {
    q: "What happens if the flight is not found or my claim cannot settle?",
    a: "If validators cannot confirm the flight on the source, the claim is marked failed and your full premium is queued as a refund you can withdraw. If a claim is never resolved before the window closes, anyone can permissionlessly expire the policy; the premium refund is always credited to you, the holder, never to the cleanup caller.",
  },
  {
    q: "Which flight-status sources are trusted?",
    a: "Core providers - flightradar24.com, flightaware.com and flightstats.com - are compiled into the contract and permanently immutable. The insurer (contract owner) may add or remove additional providers, but can never remove a core one, and the payout beneficiary can never influence the allowlist. URLs must use https and pass strict host parsing that rejects look-alike and spoofing tricks.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex size-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <HelpCircle className="size-5" />
          </div>
          <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-accent">Support</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Frequently asked questions
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Everything you need to know about coverage, consensus settlement, and connecting to
            the protocol.
          </p>
        </div>

        <Accordion type="single" collapsible defaultValue="faq-0" className="space-y-3">
          {FAQS.map((item, i) => (
            <AccordionItem key={item.q} value={`faq-${i}`}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>
                <p className="leading-relaxed">{item.a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
