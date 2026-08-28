import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: "primary" | "accent" | "success" | "muted";
  loading?: boolean;
}

const ACCENT_RING: Record<NonNullable<StatCardProps["accent"]>, string> = {
  primary: "text-primary",
  accent: "text-accent",
  success: "text-success",
  muted: "text-muted-foreground",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "muted",
  loading,
}: StatCardProps) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className="mt-1 truncate font-mono text-2xl font-semibold tabular-nums text-foreground">
              {value}
            </p>
          )}
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? (
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary [&_svg]:size-5",
              ACCENT_RING[accent]
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
