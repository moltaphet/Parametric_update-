import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { DashboardClient } from "@/components/policy/DashboardClient";

export const metadata = {
  title: "Dashboard | Parametric",
};

/**
 * Dashboard.
 *
 * Currently surfaces wallet state only. Policy purchase, active policy
 * tracking, and claim status land in the next slice; the Vite client in
 * ../frontend has working implementations of all three to port from.
 */
export default function DashboardPage() {
  return (
    <>
      <Navbar />
      {/* overflow-hidden clips the decorative bloom, which is wider than a phone
          viewport. Without it the page reports horizontal overflow and only the
          global `html { overflow-x: hidden }` hides the scrollbar - masking the
          problem rather than containing it. */}
      <main
        id="main"
        className="relative min-h-[100svh] overflow-hidden px-5 pb-24 pt-28 sm:px-8"
      >
        <div className="grid-substrate absolute inset-0 opacity-30" aria-hidden />
        <div
          className="bloom pointer-events-none absolute left-1/2 top-40 h-[320px] w-[420px]
                     -translate-x-1/2 -translate-y-1/2 opacity-30
                     sm:h-[520px] sm:w-[720px]"
          aria-hidden
        />

        <div className="relative mx-auto max-w-5xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
            Dashboard
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Buy parametric coverage and track your policies.
          </p>

          <div className="mt-10">
            <DashboardClient />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
