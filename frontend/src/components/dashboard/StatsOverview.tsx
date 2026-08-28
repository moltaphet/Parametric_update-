import { Coins, ShieldCheck, Banknote, Lock, Activity, CircleCheck } from "lucide-react";
import { StatCard } from "./StatCard";
import { Badge } from "@/components/ui/badge";
import { weiToGen } from "@/lib/format";
import type { ContractStats } from "@/lib/contract-meta";

interface StatsOverviewProps {
  stats: ContractStats | null;
  loading: boolean;
}

export function StatsOverview({ stats, loading }: StatsOverviewProps) {
  const invariantOk = stats?.liquidity_invariant ?? true;

  return (
    <section aria-label="Pool statistics" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pool overview
        </h2>
        <Badge tone={invariantOk ? "success" : "destructive"}>
          <CircleCheck className="size-3" />
          {invariantOk ? "Solvency invariant holds" : "Invariant breached"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total pool"
          value={`${weiToGen(stats?.total_pool_balance_atto ?? "0", 2)} GEN`}
          hint="Escrowed liquidity backing coverage"
          icon={<Coins />}
          accent="primary"
          loading={loading}
        />
        <StatCard
          label="Available"
          value={`${weiToGen(stats?.unreserved_available_atto ?? "0", 2)} GEN`}
          hint="Unreserved, withdrawable liquidity"
          icon={<Banknote />}
          accent="accent"
          loading={loading}
        />
        <StatCard
          label="Reserved"
          value={`${weiToGen(stats?.reserved_atto ?? "0", 2)} GEN`}
          hint="Locked worst-case exposure"
          icon={<Lock />}
          accent="muted"
          loading={loading}
        />
        <StatCard
          label="Total paid out"
          value={`${weiToGen(stats?.total_paid_atto ?? "0", 2)} GEN`}
          hint="Settled claim payouts to date"
          icon={<ShieldCheck />}
          accent="success"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Policies" value={stats?.policies_created ?? 0} icon={<Activity />} loading={loading} />
        <StatCard label="Settled" value={stats?.settled ?? 0} accent="success" loading={loading} />
        <StatCard label="Rejected" value={stats?.rejected ?? 0} loading={loading} />
        <StatCard label="Failed" value={stats?.failed ?? 0} loading={loading} />
        <StatCard label="Expired" value={stats?.expired ?? 0} loading={loading} />
      </div>
    </section>
  );
}
