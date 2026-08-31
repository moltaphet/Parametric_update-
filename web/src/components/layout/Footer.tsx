import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { CONTRACT_ADDRESS, NETWORK, explorerUrl } from "@/lib/contract";
import { shortenAddress } from "@/lib/format";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-obsidian-950">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <Logo className="h-9 w-9" sizes="36px" />
              <span className="text-sm font-semibold text-slate-100">Parametric</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              Autonomous flight-delay insurance settled from live web evidence by
              GenLayer validator consensus.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-slate-300">
                Product
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
                <li>
                  {/* inline-block + py-1 lifts the hit area to ~28px, over the
                      WCAG 2.2 24px minimum target size. */}
                  <Link
                    href="/dashboard"
                    className="inline-block py-1 transition-colors hover:text-accent-300"
                  >
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link
                    href="/#how-it-works"
                    className="inline-block py-1 transition-colors hover:text-accent-300"
                  >
                    How it works
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-slate-300">
                Contract
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
                <li>
                  <a
                    href={explorerUrl("address", CONTRACT_ADDRESS)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block py-1 transition-colors hover:text-accent-300"
                  >
                    Explorer
                  </a>
                </li>
                <li className="font-mono text-xs">{shortenAddress(CONTRACT_ADDRESS)}</li>
              </ul>
            </div>
          </div>
        </div>

        <div
          className="mt-12 flex flex-col gap-3 border-t border-white/[0.06] pt-6
                     text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>MIT licensed. Deployed on {NETWORK}.</p>
          <p>
            Not a regulated insurance product. Provided as-is for evaluation on a
            test network.
          </p>
        </div>
      </div>
    </footer>
  );
}
