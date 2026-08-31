"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // The only element on a screen that should use the full accent fill.
  primary:
    "bg-accent-400 text-obsidian-950 font-semibold hover:bg-accent-300 " +
    "shadow-[0_0_24px_-4px_var(--color-accent-500)] hover:shadow-[0_0_36px_-4px_var(--color-accent-400)]",
  secondary:
    "glass text-slate-100 hover:bg-white/[0.08] border-white/10 hover:border-accent-400/40",
  ghost: "text-slate-300 hover:text-accent-300 hover:bg-white/[0.04]",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-8 text-base",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl " +
  "transition-all duration-300 ease-[var(--ease-out-expo)] " +
  "active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none " +
  "whitespace-nowrap select-none";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

interface ButtonLinkProps {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
  /** External links open in a new tab with the usual rel hardening. */
  external?: boolean;
}

/**
 * Anchor styled as a button.
 *
 * Kept separate from `Button` rather than merged behind an `asChild` prop: a
 * navigation control and a command control differ in semantics and keyboard
 * behavior, and collapsing them tends to produce buttons that should have been
 * links.
 */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  external,
}: ButtonLinkProps) {
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], className);

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
