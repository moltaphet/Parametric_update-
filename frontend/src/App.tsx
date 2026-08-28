import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Hero } from "@/components/layout/Hero";
import { StatsOverview } from "@/components/dashboard/StatsOverview";
import { BuyPolicyForm } from "@/components/policy/BuyPolicyForm";
import { AccountPanel } from "@/components/policy/AccountPanel";
import { PolicyList } from "@/components/policy/PolicyList";
import { ClaimDialog } from "@/components/policy/ClaimDialog";
import { Logo } from "@/components/layout/Logo";
import {
  getAllPolicies,
  getStats,
  getClient,
  getAccountAddress,
  contractAddress,
  network,
  describeError,
} from "@/lib/genlayer";
import type { ContractStats, PolicyRecord } from "@/lib/contract-meta";

export default function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [stats, setStats] = useState<ContractStats | null>(null);
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [claimTarget, setClaimTarget] = useState<PolicyRecord | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);

  // Initialize the client / burner account once on mount.
  useEffect(() => {
    try {
      getClient();
      setAccount(getAccountAddress());
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStats, nextPolicies] = await Promise.all([getStats(), getAllPolicies()]);
      setStats(nextStats);
      setPolicies(nextPolicies);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const bumpRefresh = useCallback(() => {
    refresh();
    setRefreshKey((k) => k + 1);
  }, [refresh]);

  function openClaim(policy: PolicyRecord) {
    setClaimTarget(policy);
    setClaimOpen(true);
  }

  return (
    <div className="min-h-dvh bg-background">
      <Header account={account} onAccountChange={setAccount} />
      <Hero />

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        {error ? (
          <div
            className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Could not reach the contract</p>
              <p className="mt-0.5 break-words text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : null}

        <StatsOverview stats={stats} loading={loading} />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="order-2 lg:order-1">
            <PolicyList
              policies={policies}
              account={account}
              loading={loading}
              onRefresh={refresh}
              onSubmitClaim={openClaim}
              onChanged={bumpRefresh}
            />
          </div>

          <aside className="order-1 space-y-6 lg:order-2">
            <BuyPolicyForm onCreated={bumpRefresh} />
            <AccountPanel account={account} refreshKey={refreshKey} onChanged={bumpRefresh} />
          </aside>
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-8 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Logo className="size-6" />
            Parametric Insurance on GenLayer
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:items-end">
            <span className="capitalize">Network: {network}</span>
            <a
              href={`https://genlayer-explorer.vercel.app/address/${contractAddress}`}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-accent hover:underline"
            >
              {contractAddress}
            </a>
          </div>
        </div>
      </footer>

      <ClaimDialog
        policy={claimTarget}
        open={claimOpen}
        onOpenChange={setClaimOpen}
        onSubmitted={bumpRefresh}
      />
    </div>
  );
}
