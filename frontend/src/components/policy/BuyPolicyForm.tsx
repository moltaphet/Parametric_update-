import { useMemo, useState } from "react";
import { Plane, Clock, Gauge, Coins, ShieldCheck, Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TxProgress } from "./TxProgress";
import { useTx } from "@/hooks/useTx";
import { useToast } from "@/components/ui/toast";
import { tx, checkCoverageEligibility } from "@/lib/genlayer";
import { genToWei, weiToGen, localInputToIso } from "@/lib/format";
import { COVERAGE } from "@/lib/contract-meta";

interface BuyPolicyFormProps {
  onCreated: () => void;
}

interface FieldErrors {
  flight?: string;
  departure?: string;
  threshold?: string;
  premium?: string;
}

export function BuyPolicyForm({ onCreated }: BuyPolicyFormProps) {
  const { toast } = useToast();
  const { state, run, busy } = useTx();

  const [flight, setFlight] = useState("");
  const [departure, setDeparture] = useState("");
  const [threshold, setThreshold] = useState("60");
  const [premium, setPremium] = useState("1");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [eligibility, setEligibility] = useState<{ ok: boolean; reason: string } | null>(null);

  const premiumWei = useMemo(() => {
    try {
      return genToWei(premium || "0");
    } catch {
      return 0n;
    }
  }, [premium]);

  const tier2Payout = useMemo(
    () => weiToGen(premiumWei * BigInt(COVERAGE.tier2Multiplier), 4),
    [premiumWei]
  );
  const tier1Payout = useMemo(
    () => weiToGen(premiumWei * BigInt(COVERAGE.tier1Multiplier), 4),
    [premiumWei]
  );

  // Minimum selectable departure = now + 24h cutoff (advisory; contract enforces).
  const minDeparture = useMemo(() => {
    const d = new Date(Date.now() + (COVERAGE.cutoffHours + 1) * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  }, []);

  function validate(): boolean {
    const next: FieldErrors = {};
    if (flight.trim() === "") next.flight = "Flight number is required.";
    if (departure === "") next.departure = "Departure time is required.";
    if (!(Number(threshold) > 0)) next.threshold = "Threshold must be a positive number of minutes.";
    if (!(premiumWei > 0n)) next.premium = "Premium must be greater than zero.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function checkEligibility() {
    if (departure === "") return;
    try {
      const iso = localInputToIso(departure);
      const res = (await checkCoverageEligibility(iso)) as { eligible: boolean; reason: string };
      setEligibility({ ok: Boolean(res.eligible), reason: String(res.reason || "") });
    } catch {
      setEligibility(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!validate()) return;

    const iso = localInputToIso(departure);
    try {
      await run((onStage) =>
        tx.createPolicy(flight.trim(), iso, Number(threshold), premiumWei, onStage)
      );
      toast({
        variant: "success",
        title: "Policy created",
        description: `${flight.trim()} coverage is now active.`,
      });
      setFlight("");
      setDeparture("");
      setEligibility(null);
      onCreated();
    } catch (err) {
      toast({
        variant: "error",
        title: "Could not create policy",
        description: state.error ?? String(err),
      });
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <CardTitle>Buy coverage</CardTitle>
            <CardDescription>
              Underwrite a flight before the {COVERAGE.cutoffHours}h cutoff.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="flight">Flight number</Label>
            <div className="relative">
              <Plane className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="flight"
                placeholder="AA100"
                autoComplete="off"
                value={flight}
                onChange={(e) => setFlight(e.target.value.toUpperCase())}
                aria-invalid={Boolean(errors.flight)}
                aria-describedby={errors.flight ? "flight-error" : undefined}
                className="pl-9"
              />
            </div>
            {errors.flight ? (
              <p id="flight-error" className="text-xs text-destructive" role="alert">
                {errors.flight}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="departure">Scheduled departure (UTC)</Label>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="departure"
                type="datetime-local"
                min={minDeparture}
                value={departure}
                onChange={(e) => {
                  setDeparture(e.target.value);
                  setEligibility(null);
                }}
                onBlur={checkEligibility}
                aria-invalid={Boolean(errors.departure)}
                aria-describedby={errors.departure ? "departure-error" : "departure-help"}
                className="pl-9"
              />
            </div>
            {errors.departure ? (
              <p id="departure-error" className="text-xs text-destructive" role="alert">
                {errors.departure}
              </p>
            ) : (
              <p id="departure-help" className="text-xs text-muted-foreground">
                Must be at least {COVERAGE.cutoffHours}h out and within {COVERAGE.maxAdvanceDays} days.
              </p>
            )}
            {eligibility ? (
              <Badge tone={eligibility.ok ? "success" : "destructive"}>
                {eligibility.ok ? "Eligible for coverage" : eligibility.reason || "Not eligible"}
              </Badge>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="threshold">Delay threshold (minutes)</Label>
              <div className="relative">
                <Gauge className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="threshold"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  aria-invalid={Boolean(errors.threshold)}
                  aria-describedby={errors.threshold ? "threshold-error" : undefined}
                  className="pl-9"
                />
              </div>
              {errors.threshold ? (
                <p id="threshold-error" className="text-xs text-destructive" role="alert">
                  {errors.threshold}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="premium">Premium (GEN)</Label>
              <div className="relative">
                <Coins className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="premium"
                  type="number"
                  min={0}
                  step="0.1"
                  inputMode="decimal"
                  value={premium}
                  onChange={(e) => setPremium(e.target.value)}
                  aria-invalid={Boolean(errors.premium)}
                  aria-describedby={errors.premium ? "premium-error" : undefined}
                  className="pl-9"
                />
              </div>
              {errors.premium ? (
                <p id="premium-error" className="text-xs text-destructive" role="alert">
                  {errors.premium}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Info className="size-3.5" />
              Payout tiers on this premium
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Tier 1 ({COVERAGE.tier1Multiplier}x)</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {tier1Payout} GEN
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Tier 2 ({COVERAGE.tier2Multiplier}x)
                </p>
                <p className="font-mono text-sm font-semibold tabular-nums text-primary">
                  {tier2Payout} GEN
                </p>
              </div>
            </div>
          </div>

          <TxProgress state={state} />

          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Creating policy..." : "Create policy"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
