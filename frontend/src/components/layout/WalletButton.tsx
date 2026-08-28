import { Wallet, Copy, ExternalLink, RefreshCw, LogOut, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useWallet } from "@/context/wallet";
import { useToast } from "@/components/ui/toast";
import { shortAddress } from "@/lib/format";
import { explorerUrl } from "@/lib/genlayer";

export function WalletButton() {
  const { account, connected, connect, disconnect, rotate } = useWallet();
  const { toast } = useToast();

  function handleConnect() {
    const addr = connect();
    toast({
      variant: "success",
      title: "Wallet connected",
      description: shortAddress(addr),
    });
  }

  function handleDisconnect() {
    disconnect();
    toast({ variant: "info", title: "Wallet disconnected" });
  }

  function handleRotate() {
    const addr = rotate();
    toast({ variant: "info", title: "New session account", description: shortAddress(addr) });
  }

  function copyAddress() {
    if (!account) return;
    navigator.clipboard?.writeText(account).then(
      () => toast({ variant: "success", title: "Address copied" }),
      () => toast({ variant: "error", title: "Could not copy address" })
    );
  }

  if (!connected || !account) {
    return (
      <Button onClick={handleConnect} className="gap-2">
        <Wallet className="size-4" />
        <span className="hidden sm:inline">Connect wallet</span>
        <span className="sm:hidden">Connect</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border border-border bg-card/70 py-1.5 pl-3 pr-2.5 text-sm transition-colors hover:border-accent/50 hover:bg-secondary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Wallet menu"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-[10px] font-bold text-background">
            {account.slice(2, 4).toUpperCase()}
          </span>
          <span className="font-mono text-xs tabular-nums">{shortAddress(account)}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Session account</DropdownMenuLabel>
        <div className="px-2.5 pb-2">
          <p className="break-all font-mono text-xs text-foreground">{account}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={copyAddress}>
          <Copy /> Copy address
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={explorerUrl("address", account)} target="_blank" rel="noreferrer noopener">
            <ExternalLink /> View on explorer
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleRotate}>
          <RefreshCw /> New session account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={handleDisconnect}>
          <LogOut /> Disconnect wallet
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
