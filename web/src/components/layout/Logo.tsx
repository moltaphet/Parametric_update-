import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  /**
   * Sizing is expressed as Tailwind height/width classes rather than a numeric
   * prop so the mark can scale per breakpoint (e.g. "h-20 w-20 sm:h-28 sm:w-28").
   * The image itself uses `fill`, so the wrapper's box is the source of truth.
   */
  className?: string;
  /** Renders a soft accent halo behind the mark. Used at hero scale only. */
  glow?: boolean;
  /** Above-the-fold marks should preload; everything else should not. */
  priority?: boolean;
  /**
   * Empty by default: the mark is nearly always paired with the visible
   * "Parametric" wordmark, which makes the image decorative. Pass a value only
   * when the logo stands alone.
   */
  alt?: string;
  /** Responsive hint for the optimizer; keep in step with `className`. */
  sizes?: string;
}

/**
 * The Parametric brand mark.
 *
 * The source art is a glowing shield on an opaque dark field. It was keyed to
 * transparency by luminance (see web/README.md) so it composites onto the glass
 * navbar and the WebGL hero without showing a rectangular plate. Do not swap in
 * the raw JPEG - it will render as a visible box on every dark surface.
 */
export function Logo({
  className,
  glow = false,
  priority = false,
  alt = "",
  sizes = "128px",
}: LogoProps) {
  return (
    <span className={cn("relative block shrink-0", className)}>
      {glow && (
        <span
          className="pointer-events-none absolute inset-0 -z-10 scale-[1.35] rounded-full
                     bg-accent-400/20 blur-2xl"
          aria-hidden
        />
      )}
      <Image
        src="/logo-mark-512.png"
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-contain"
      />
    </span>
  );
}
