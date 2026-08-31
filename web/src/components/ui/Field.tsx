"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5",
        "text-sm text-slate-100 placeholder:text-slate-600",
        "transition-colors duration-200",
        "hover:border-white/[0.14]",
        "focus:border-accent-400/50 focus:bg-white/[0.05] focus:outline-none",
        // aria-invalid drives the error ring, so the visual state and the
        // accessibility state can never disagree.
        "aria-[invalid=true]:border-status-failed/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        // Keep the native date/number pickers usable on a dark surface.
        "[color-scheme:dark]",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

/**
 * Labelled form field with inline validation messaging.
 *
 * Owns the id wiring so a caller cannot accidentally ship an input whose error
 * text is invisible to screen readers: `aria-describedby` always points at
 * whichever of hint/error is currently rendered.
 */
export function Field({
  id,
  label,
  hint,
  error,
  icon,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
    className: string;
  }) => ReactNode;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-300">
        {label}
      </label>

      <div className="relative">
        {icon && (
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            aria-hidden
          >
            {icon}
          </span>
        )}
        {children({
          id,
          "aria-invalid": Boolean(error),
          "aria-describedby": describedBy,
          className: icon ? "pl-10" : "",
        })}
      </div>

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-status-failed">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
