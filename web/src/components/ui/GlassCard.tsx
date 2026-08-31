"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /** Stagger index, used to cascade cards into view within a grid. */
  index?: number;
  /** Adds an accent edge-glow on hover. Off for purely informational panels. */
  interactive?: boolean;
}

/**
 * The primary surface of the design system.
 *
 * Entrance is tied to `whileInView` with `once: true` so cards animate as the
 * user reaches them and never re-animate on scroll-back, which reads as noise.
 */
export function GlassCard({
  children,
  className,
  index = 0,
  interactive = false,
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        duration: 0.6,
        // Cap the cascade so a long grid does not leave the last card waiting.
        delay: Math.min(index * 0.08, 0.4),
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(
        "glass rounded-2xl p-6 transition-all duration-500",
        interactive &&
          "hover:border-accent-400/30 hover:bg-white/[0.06] " +
            "hover:shadow-[0_0_40px_-12px_var(--color-accent-500)]",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
