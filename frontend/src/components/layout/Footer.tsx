import { Github, ExternalLink, FileCode2 } from "lucide-react";
import { Logo } from "./Logo";
import { NetworkStatus } from "./NetworkStatus";
import { contractAddress, explorerUrl } from "@/lib/genlayer";
import { shortAddress } from "@/lib/format";

const GITHUB_URL = "https://github.com/moltaphet/Parametric";

const NAV_COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] =
  [
    {
      title: "Protocol",
      links: [
        { label: "Dashboard", href: "#dashboard" },
        { label: "About", href: "#about" },
        { label: "FAQ", href: "#faq" },
      ],
    },
    {
      title: "Actions",
      links: [
        { label: "Buy coverage", href: "#dashboard" },
        { label: "Policies", href: "#dashboard" },
        { label: "Fund the pool", href: "#dashboard" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "GitHub repository", href: GITHUB_URL, external: true },
        { label: "Contract on explorer", href: explorerUrl("address", contractAddress), external: true },
        { label: "GenLayer docs", href: "https://docs.genlayer.com", external: true },
      ],
    },
  ];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <Logo className="size-7" />
              <span className="text-sm font-semibold">Parametric Insurance</span>
            </div>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Autonomous flight-delay insurance settled from live web evidence by GenLayer
              validator consensus.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="GitHub repository"
              >
                <Github className="size-4" />
              </a>
              <a
                href={explorerUrl("address", contractAddress)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Contract on explorer"
              >
                <FileCode2 className="size-4" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {NAV_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                {col.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noreferrer noopener" : undefined}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                      {link.external ? <ExternalLink className="size-3" /> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <NetworkStatus variant="inline" />
            <a
              href={explorerUrl("address", contractAddress)}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-xs text-muted-foreground transition-colors hover:text-accent"
            >
              {shortAddress(contractAddress)}
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Copyright {year} Parametric Insurance. Built on GenLayer.
          </p>
        </div>
      </div>
    </footer>
  );
}
