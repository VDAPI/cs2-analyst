import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "CS2 Analyst — Demo Analysis Platform",
  description:
    "Upload CS2 demos and get detailed analytics: player stats, heatmaps, 2D replay, economy tracking, grenade analysis and more.",
  keywords: [
    "CS2",
    "Counter-Strike 2",
    "demo analysis",
    "esports analytics",
    "heatmap",
    "replay viewer",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[var(--canvas)] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
