import { useEffect, useState, useCallback } from "react";
import { Coins, Banknote, ArrowDownToLine, PlusCircle } from "lucide-react";
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
import { TxProgress } from "./TxProgress";
import { useTx } from "@/hooks/useTx";
import { useToast } from "@/components/ui/toast";
import { tx, claimableOf } from "@/lib/genlayer";
import { formatGen, genToWei } from "@/lib/format";

interface AccountPanelProps {
  account: string | null;
  refreshKey: number;
  onChanged: () => void;
}

export function AccountPanel({ account, refreshKey, onChanged }: AccountPanelProps) {
  const { toast } = useToast();
  const withdrawTx = useTx();
  const fundTx = useTx();

  const [claimable, setClaimable] = useState<string>("0");
  const [fundAmount, setFundAmount] = useState("10");

  const loadClaimable = useCallback(async () => {
    if (!account) return;
    try {
      const value = await claimableOf(account);
      setClaimable(value);
    } catch {
      setClaimable("0");
    }
  }, [account]);

  useEffect(() => {
    loadClaimable();
  }, [loadClaimable, refreshKey]);

  const hasRefund = (() => {
    try {
      return BigInt(claimable) > 0n;
    } catch {
      return false;
    }
  })();

  async function withdraw() {
    try {
      await withdrawTx.run((onStage) => tx.withdraw(onStage));
      toast({ variant: "success", title: "Refund withdrawn" });
      await loadClaimable();
      onChanged();
    } catch (err) {
      toast({
        variant: "error",
        title: "Withdraw failed",
        description: withdrawTx.state.error ?? String(err),
      });
    }
  }

  async function fund(e: React.FormEvent) {
    e.preventDefault();
    let wei = 0n;
    try {
      wei = genToWei(fundAmount || "0");
    } catch {
      wei = 0n;
    }
    if (wei <= 0n) {
      toast({ variant: "error", title: "Enter an amount greater than zero" });
      return;
    }
    try {
      await fundTx.run((onStage) => tx.fundPool(wei, onStage));
      toast({
        variant: "success",
        title: "Pool funded",
        description: `Added ${formatGen(wei, 2)} of liquidity.`,
      });
      onChanged();
    } catch (err) {
      toast({
        variant: "error",
        title: "Funding failed",
        description: fundTx.state.error ?? String(err),
      });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-success/10 text-success">
              <Banknote className="size-5" />
            </div>
            <div>
              <CardTitle>Refunds</CardTitle>
              <CardDescription>Failed and expired premiums queued to you.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Claimable balance
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {formatGen(claimable, 4)}
            </p>
          </div>
          <TxProgress state={withdrawTx.state} />
          <Button
            className="w-full"
            variant="accent"
            onClick={withdraw}
            disabled={!hasRefund || withdrawTx.busy}
          >
            <ArrowDownToLine className="size-4" />
            {withdrawTx.busy ? "Withdrawing..." : "Withdraw refunds"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Coins className="size-5" />
            </div>
            <div>
              <CardTitle>Fund the pool</CardTitle>
              <CardDescription>Add payout liquidity as an underwriter.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={fund} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fund-amount">Amount (GEN)</Label>
              <div className="relative">
                <Coins className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="fund-amount"
                  type="number"
                  min={0}
                  step="1"
                  inputMode="decimal"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <TxProgress state={fundTx.state} />
            <Button type="submit" className="w-full" disabled={fundTx.busy}>
              <PlusCircle className="size-4" />
              {fundTx.busy ? "Funding..." : "Fund pool"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
