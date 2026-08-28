import { useNetworkStatus, type NetworkHealth } from "@/hooks/useNetworkStatus";
import { network } from "@/lib/genlayer";
import { cn } from "@/lib/utils";

const DOT: Record<NetworkHealth, string> = {
  checking: "bg-warning",
  online: "bg-success",
  offline: "bg-destructive",
};

const LABEL: Record<NetworkHealth, string> = {
  checking: "Checking",
  online: "Operational",
  offline: "Unreachable",
};

interface NetworkStatusProps {
  variant?: "chip" | "inline";
  className?: string;
}

export function NetworkStatus({ variant = "chip", className }: NetworkStatusProps) {
  const status = useNetworkStatus();

  const dot = (
    <span className="relative flex size-2">
      {status === "online" ? (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            DOT[status]
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex size-2 rounded-full", DOT[status])} />
    </span>
  );

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
        {dot}
        <span className="capitalize">
          {network} - {LABEL[status]}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-2.5 py-1 text-xs font-medium capitalize text-foreground",
        className
      )}
    >
      {dot}
      {network}
    </span>
  );
}
