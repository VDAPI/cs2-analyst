import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Chakra_Petch } from "next/font/google";
import { SessionProvider } from "@/components/providers/session-provider";
import { ToastProvider } from "@/components/ui/toast";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
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
  applicationName: "CS2 Analyst",
  // PWA (S18): app/manifest.ts + public/sw.js; iOS reads these tags instead.
  appleWebApp: { capable: true, title: "CS2 Analyst", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/pwa/icon.svg", type: "image/svg+xml" }, { url: "/pwa/icon-192.png", sizes: "192x192" }],
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${GeistSans.variable} ${GeistMono.variable} ${chakraPetch.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[var(--canvas)] font-sans antialiased">
        <I18nProvider locale={locale}>
          <SessionProvider>
            <PwaProvider>
              <ToastProvider>{children}</ToastProvider>
            </PwaProvider>
          </SessionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
