import { cn } from "@/lib/utils";

/** Geometric mark: a shield containing an upward flight path (coverage + travel). */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8", className)}
      role="img"
      aria-label="Parametric Insurance logo"
    >
      <defs>
        <linearGradient id="pi-logo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-primary)" />
          <stop offset="1" stopColor="var(--color-accent)" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5 27 6.2v8.1c0 6.9-4.5 12.4-11 15.2-6.5-2.8-11-8.3-11-15.2V6.2L16 2.5Z"
        fill="url(#pi-logo)"
        fillOpacity="0.16"
        stroke="url(#pi-logo)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 20.5 15 13l3 3.4L23 9"
        fill="none"
        stroke="url(#pi-logo)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="9" r="1.9" fill="var(--color-primary)" />
    </svg>
  );
}
