import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Hero } from "@/components/layout/Hero";
import { Footer } from "@/components/layout/Footer";
import { StatsOverview } from "@/components/dashboard/StatsOverview";
import { BuyPolicyForm } from "@/components/policy/BuyPolicyForm";
import { AccountPanel } from "@/components/policy/AccountPanel";
import { PolicyList } from "@/components/policy/PolicyList";
import { ClaimDialog } from "@/components/policy/ClaimDialog";
import { About } from "@/components/sections/About";
import { Faq } from "@/components/sections/Faq";
import { useWallet } from "@/context/wallet";
import { getAllPolicies, getStats, describeError } from "@/lib/genlayer";
import type { ContractStats, PolicyRecord } from "@/lib/contract-meta";

export default function App() {
  const { account } = useWallet();
  const [stats, setStats] = useState<ContractStats | null>(null);
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [claimTarget, setClaimTarget] = useState<PolicyRecord | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);

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
    <div id="top" className="min-h-dvh bg-background">
      <Navbar />
      <Hero />

      <main className="mx-auto max-w-7xl space-y-16 px-4 py-10 sm:px-6 lg:px-8">
        <div id="dashboard" className="scroll-mt-20 space-y-10">
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
        </div>

        <About />
        <Faq />
      </main>

      <Footer />

      <ClaimDialog
        policy={claimTarget}
        open={claimOpen}
        onOpenChange={setClaimOpen}
        onSubmitted={bumpRefresh}
      />
    </div>
  );
}
