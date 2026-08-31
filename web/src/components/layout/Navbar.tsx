"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#coverage", label: "Coverage" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // The bar is transparent over the hero and gains a glass backing once the
  // user scrolls, so it never competes with the headline at rest.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled ? "glass border-b border-white/[0.06]" : "border-b border-transparent"
      )}
    >
      <nav
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8"
        aria-label="Primary"
      >
        <Link
          href="/"
          className="group flex items-center gap-2.5"
          onClick={() => setOpen(false)}
        >
          {/* The mark carries no alt text: the wordmark beside it already names
              the product, so announcing it twice is noise for screen readers. */}
          <Logo
            className="h-9 w-9 transition-transform duration-500 group-hover:scale-105"
            sizes="36px"
            priority
          />
          <span className="text-sm font-semibold tracking-tight text-slate-100">
            Parametric
          </span>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3.5 py-2 text-sm text-slate-400 transition-colors
                         hover:bg-white/[0.04] hover:text-slate-100"
            >
              {link.label}
            </Link>
          ))}
          <ConnectButton className="ml-3" />
        </div>

        {/* Mobile trigger */}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/[0.05] md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile sheet */}
      {open && (
        <div
          id="mobile-menu"
          className="glass-strong border-t border-white/[0.06] md:hidden"
        >
          <div className="flex flex-col gap-1 px-5 py-4">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm text-slate-300 transition-colors
                           hover:bg-white/[0.05] hover:text-slate-100"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-white/[0.06] pt-3">
              <ConnectButton className="w-full [&>button]:w-full" />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
