import { useState } from "react";
import {
  Plane,
  ArrowRight,
  Gavel,
  RotateCcw,
  Clock,
  Trophy,
  ExternalLink,
  Timer,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TxProgress } from "./TxProgress";
import { useTx } from "@/hooks/useTx";
import { useToast } from "@/components/ui/toast";
import { tx } from "@/lib/genlayer";
import { formatGen, formatTimestamp, relativeTime, shortAddress } from "@/lib/format";
import { statusMeta, type PolicyRecord } from "@/lib/contract-meta";
import { cn } from "@/lib/utils";

interface PolicyCardProps {
  policy: PolicyRecord;
  isOwn: boolean;
  onSubmitClaim: (policy: PolicyRecord) => void;
  onChanged: () => void;
}

export function PolicyCard({ policy, isOwn, onSubmitClaim, onChanged }: PolicyCardProps) {
  const { toast } = useToast();
  const { state, run, busy } = useTx();
  const [expanded, setExpanded] = useState(false);

  const meta = statusMeta(policy.status);
  const nowSec = Math.floor(Date.now() / 1000);
  const windowOpen = nowSec >= policy.claim_opens_ts && nowSec <= policy.claim_closes_ts;
  const windowClosed = nowSec > policy.claim_closes_ts;

  const canSubmitClaim = isOwn && policy.status === "ACTIVE" && windowOpen;
  const canEvaluate = policy.status === "CLAIM_SUBMITTED" && !windowClosed;
  const canReclaim =
    isOwn && (policy.status === "ACTIVE" || policy.status === "CLAIM_SUBMITTED") && windowClosed;
  const isPaid = policy.status === "SETTLED_PAID";

  async function evaluate() {
    try {
      await run((onStage) => tx.evaluateClaim(policy.policy_id, onStage));
      toast({
        variant: "success",
        title: `Policy #${policy.policy_id} evaluated`,
        description: "Consensus reached a verdict.",
      });
      onChanged();
    } catch (err) {
      toast({ variant: "error", title: "Evaluation failed", description: state.error ?? String(err) });
    }
  }

  async function reclaim() {
    try {
      await run((onStage) => tx.reclaimExpired(policy.policy_id, onStage));
      toast({
        variant: "success",
        title: `Policy #${policy.policy_id} reclaimed`,
        description: "Premium queued for withdrawal.",
      });
      onChanged();
    } catch (err) {
      toast({ variant: "error", title: "Reclaim failed", description: state.error ?? String(err) });
    }
  }

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-colors hover:border-border/80",
        isPaid && "border-success/40"
      )}
    >
      {isPaid ? (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-accent to-success" />
      ) : null}
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-accent">
              <Plane className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-mono text-base font-semibold">{policy.flight_number}</p>
                <span className="text-xs text-muted-foreground">#{policy.policy_id}</span>
                {isOwn ? (
                  <Badge tone="primary" className="px-1.5 py-0 text-[10px]">
                    Yours
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" />
                {formatTimestamp(policy.departure_ts)}
              </p>
            </div>
          </div>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-lg border border-border/70 bg-muted/30 p-3">
          <Metric label="Premium" value={formatGen(policy.premium_atto, 2)} />
          <Metric
            label="Threshold"
            value={`${policy.delay_threshold_mins}m`}
          />
          <Metric
            label={isPaid ? "Payout" : "Max payout"}
            value={formatGen(isPaid ? policy.payout_atto : policy.max_exposure_atto, 2)}
            highlight={isPaid}
          />
        </div>

        {/* Claim window status */}
        {policy.status === "ACTIVE" || policy.status === "CLAIM_SUBMITTED" ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="size-3.5" />
            {windowClosed
              ? `Claim window closed ${relativeTime(policy.claim_closes_ts)}`
              : windowOpen
                ? `Claim window open - closes ${relativeTime(policy.claim_closes_ts)}`
                : `Claim window opens ${relativeTime(policy.claim_opens_ts)}`}
          </p>
        ) : null}

        {/* Verdict / decision for terminal states */}
        {policy.verdict || policy.decision_reason ? (
          <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-muted-foreground">Consensus verdict</span>
              {policy.verdict ? (
                <span className="flex items-center gap-1 font-mono text-foreground">
                  {isPaid ? <Trophy className="size-3.5 text-primary" /> : null}
                  {policy.verdict}
                  {policy.payout_tier > 0 ? ` - tier ${policy.payout_tier}` : ""}
                </span>
              ) : null}
            </div>
            {policy.observed_delay_mins > 0 ? (
              <p className="mt-1 text-muted-foreground">
                Observed delay: {policy.observed_delay_mins} minutes
              </p>
            ) : null}
            {policy.decision_reason ? (
              <p className="mt-1 break-words font-mono text-[11px] text-muted-foreground">
                {policy.decision_reason}
              </p>
            ) : null}
          </div>
        ) : null}

        <TxProgress state={state} />

        {/* Contextual actions */}
        {canSubmitClaim || canEvaluate || canReclaim ? (
          <div className="flex flex-wrap gap-2">
            {canSubmitClaim ? (
              <Button size="sm" onClick={() => onSubmitClaim(policy)} disabled={busy}>
                <Gavel className="size-4" /> Submit claim
              </Button>
            ) : null}
            {canEvaluate ? (
              <Button size="sm" variant="accent" onClick={evaluate} disabled={busy}>
                <ArrowRight className="size-4" />
                {busy ? "Evaluating..." : "Evaluate claim"}
              </Button>
            ) : null}
            {canReclaim ? (
              <Button size="sm" variant="outline" onClick={reclaim} disabled={busy}>
                <RotateCcw className="size-4" /> Reclaim premium
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-border/60 pt-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            {shortAddress(policy.holder)}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-accent underline-offset-2 hover:underline cursor-pointer"
            aria-expanded={expanded}
          >
            {expanded ? "Hide details" : "Details"}
          </button>
        </div>

        {expanded ? (
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <Detail label="Claim opens" value={formatTimestamp(policy.claim_opens_ts)} />
            <Detail label="Claim closes" value={formatTimestamp(policy.claim_closes_ts)} />
            <Detail label="Reserve locked" value={formatGen(policy.locked_reserve_atto, 2)} />
            <Detail label="Departure (raw)" value={policy.departure_time} mono />
            {policy.flight_status_url ? (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Cited source</dt>
                <dd>
                  <a
                    href={policy.flight_status_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 break-all font-mono text-accent hover:underline"
                  >
                    {policy.flight_status_url}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate font-mono text-sm font-semibold tabular-nums",
          highlight ? "text-success" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-foreground", mono && "font-mono")}>{value}</dd>
    </div>
  );
}
