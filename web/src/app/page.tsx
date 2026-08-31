import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/landing/Hero";
import { ValueProps } from "@/components/landing/ValueProps";
import { CoverageTimeline } from "@/components/landing/CoverageTimeline";
import { CtaBand } from "@/components/landing/CtaBand";

/**
 * Landing page.
 *
 * Composition only - every section owns its own data fetching and animation, so
 * sections can be reordered or removed without touching this file.
 */
export default function HomePage() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <ValueProps />
        <CoverageTimeline />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}
