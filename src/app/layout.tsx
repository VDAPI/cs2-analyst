import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Chakra_Petch } from "next/font/google";
import { SessionProvider } from "@/components/providers/session-provider";
import { ToastProvider } from "@/components/ui/toast";
import "@/styles/globals.css";

const chakraPetch = Chakra_Petch({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-chakra-petch",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08070D",
};

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
      className={`${GeistSans.variable} ${GeistMono.variable} ${chakraPetch.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[var(--canvas)] font-sans antialiased">
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
