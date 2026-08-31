import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// Two families only: Inter for interface text, JetBrains Mono for on-chain
// values. Monospacing amounts matters here - proportional digits make wei
// figures hard to compare down a column.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Parametric | Autonomous flight delay insurance",
  description:
    "Flight-delay insurance settled from live web evidence by GenLayer validator consensus. No claims adjuster, no discretion.",
  openGraph: {
    title: "Parametric | Autonomous flight delay insurance",
    description:
      "Coverage that pays itself out, settled by validator consensus on GenLayer.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#04060c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="antialiased">
        {/* Keyboard users land here first; the hero is decorative and long. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]
                     focus:rounded-lg focus:bg-accent-400 focus:px-4 focus:py-2
                     focus:text-sm focus:font-medium focus:text-obsidian-950"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
