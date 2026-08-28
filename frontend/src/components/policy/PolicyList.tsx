import { useMemo, useState } from "react";
import { Inbox, RefreshCw, LayoutGrid } from "lucide-react";
import { PolicyCard } from "./PolicyCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PolicyRecord } from "@/lib/contract-meta";

type Filter = "all" | "mine" | "active" | "claim" | "settled";

interface PolicyListProps {
  policies: PolicyRecord[];
  account: string | null;
  loading: boolean;
  onRefresh: () => void;
  onSubmitClaim: (policy: PolicyRecord) => void;
  onChanged: () => void;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "active", label: "Active" },
  { key: "claim", label: "In claim" },
  { key: "settled", label: "Settled" },
];

export function PolicyList({
  policies,
  account,
  loading,
  onRefresh,
  onSubmitClaim,
  onChanged,
}: PolicyListProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const lower = account?.toLowerCase();

  const filtered = useMemo(() => {
    return policies.filter((p) => {
      const isOwn = p.holder.toLowerCase() === lower;
      switch (filter) {
        case "mine":
          return isOwn;
        case "active":
          return p.status === "ACTIVE";
        case "claim":
          return p.status === "CLAIM_SUBMITTED";
        case "settled":
          return p.status === "SETTLED_PAID";
        default:
          return true;
      }
    });
  }, [policies, filter, lower]);

  return (
    <section aria-label="Policies" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Policies
          </h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {filtered.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  filter === f.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-pressed={filter === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh policies"
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          </Button>
        </div>
      </div>

      {loading && policies.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Inbox className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No policies here yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {filter === "all"
                  ? "Create the first policy to see it appear on the dashboard."
                  : "Try a different filter, or create a new policy."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((p) => (
            <div key={p.policy_id} className="animate-fade-in-up">
              <PolicyCard
                policy={p}
                isOwn={p.holder.toLowerCase() === lower}
                onSubmitClaim={onSubmitClaim}
                onChanged={onChanged}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
