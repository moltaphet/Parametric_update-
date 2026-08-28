import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";
import { NetworkStatus } from "./NetworkStatus";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#dashboard", label: "Dashboard" },
  { href: "#about", label: "About" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <a href="#top" className="flex items-center gap-3" aria-label="Parametric Insurance home">
            <Logo />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight sm:text-base">
                Parametric Insurance
              </p>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Consensus-settled flight-delay coverage
              </p>
            </div>
          </a>
        </div>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <NetworkStatus className="hidden sm:inline-flex" />
          <WalletButton />
          <button
            className="inline-flex size-10 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary md:hidden cursor-pointer"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation */}
      <div
        className={cn(
          "overflow-hidden border-t border-border/70 transition-[max-height] duration-300 md:hidden",
          open ? "max-h-64" : "max-h-0"
        )}
      >
        <nav className="flex flex-col gap-1 px-4 py-3" aria-label="Mobile">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <div className="px-3 py-2">
            <NetworkStatus variant="inline" />
          </div>
        </nav>
      </div>
    </header>
  );
}
