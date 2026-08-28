import { useState } from "react";
import { Link2, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TxProgress } from "./TxProgress";
import { useTx } from "@/hooks/useTx";
import { useToast } from "@/components/ui/toast";
import { tx, isTrustedUrl } from "@/lib/genlayer";
import { CORE_TRUSTED_DOMAINS, type PolicyRecord } from "@/lib/contract-meta";

interface ClaimDialogProps {
  policy: PolicyRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}

export function ClaimDialog({ policy, open, onOpenChange, onSubmitted }: ClaimDialogProps) {
  const { toast } = useToast();
  const { state, run, busy } = useTx();
  const [url, setUrl] = useState("");
  const [trust, setTrust] = useState<{ trusted: boolean; host: string; reason: string } | null>(
    null
  );
  const [checking, setChecking] = useState(false);

  async function verify() {
    if (url.trim() === "") return;
    setChecking(true);
    try {
      const res = await isTrustedUrl(url.trim());
      setTrust(res);
    } catch {
      setTrust(null);
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!policy || busy) return;
    try {
      await run((onStage) => tx.submitClaim(policy.policy_id, url.trim(), onStage));
      toast({
        variant: "success",
        title: "Claim submitted",
        description: `Policy #${policy.policy_id} is now awaiting evaluation.`,
      });
      setUrl("");
      setTrust(null);
      onOpenChange(false);
      onSubmitted();
    } catch (err) {
      toast({ variant: "error", title: "Claim rejected", description: state.error ?? String(err) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Submit claim {policy ? `- policy #${policy.policy_id}` : ""}
          </DialogTitle>
          <DialogDescription>
            Cite a flight-status page from an allowlisted authoritative source. Validators will
            render it under consensus to verify the delay.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="claim-url">Flight-status URL (https)</Label>
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="claim-url"
                type="url"
                inputMode="url"
                placeholder="https://www.flightaware.com/live/flight/AA100"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setTrust(null);
                }}
                onBlur={verify}
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {CORE_TRUSTED_DOMAINS.map((d) => (
                <Badge key={d} tone="muted" className="font-mono">
                  {d}
                </Badge>
              ))}
            </div>

            {checking ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Checking allowlist...
              </p>
            ) : trust ? (
              trust.trusted ? (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <ShieldCheck className="size-3.5" /> Trusted source ({trust.host})
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
                  <ShieldAlert className="size-3.5" />
                  {trust.reason || "Untrusted source"}
                </p>
              )
            ) : null}
          </div>

          <TxProgress state={state} />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || url.trim() === "" || trust?.trusted === false}>
              {busy ? "Submitting..." : "Submit claim"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
