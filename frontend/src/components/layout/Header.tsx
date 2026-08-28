import { useState } from "react";
import { Copy, RefreshCw, Wallet, ExternalLink } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { shortAddress } from "@/lib/format";
import { network, resetAccount } from "@/lib/genlayer";
import { useToast } from "@/components/ui/toast";

interface HeaderProps {
  account: string | null;
  onAccountChange: (address: string) => void;
}

export function Header({ account, onAccountChange }: HeaderProps) {
  const { toast } = useToast();
  const [rotating, setRotating] = useState(false);

  const explorer = `https://genlayer-explorer.vercel.app/address/${account ?? ""}`;

  function copyAddress() {
    if (!account) return;
    navigator.clipboard?.writeText(account).then(
      () => toast({ variant: "success", title: "Address copied" }),
      () => toast({ variant: "error", title: "Could not copy address" })
    );
  }

  function rotate() {
    setRotating(true);
    try {
      const next = resetAccount();
      onAccountChange(next);
      toast({
        variant: "info",
        title: "New session account",
        description: shortAddress(next),
      });
    } finally {
      setRotating(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight sm:text-base">
              Parametric Insurance
            </p>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Consensus-settled flight-delay coverage
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Badge tone="accent" className="hidden sm:inline-flex capitalize">
            <span className="size-1.5 rounded-full bg-accent animate-pulse-ring" />
            {network}
          </Badge>

          <div className="flex items-center gap-1 rounded-full border border-border bg-card/70 py-1 pl-3 pr-1 text-sm">
            <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-mono text-xs tabular-nums text-foreground">
              {shortAddress(account)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={copyAddress}
              aria-label="Copy account address"
            >
              <Copy className="size-3.5" />
            </Button>
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer noopener"
              className="hidden size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:inline-flex"
              aria-label="View account on explorer"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={rotate}
            disabled={rotating}
            aria-label="Rotate session account"
            title="Rotate session account"
          >
            <RefreshCw className={rotating ? "size-4 animate-spin" : "size-4"} />
          </Button>
        </div>
      </div>
    </header>
  );
}
