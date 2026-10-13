import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Chakra_Petch } from "next/font/google";
import { SessionProvider } from "@/components/providers/session-provider";
import { ToastProvider } from "@/components/ui/toast";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import { MESSAGES } from "@/lib/i18n/translate";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import "@/styles/globals.css";

// Preloads are what a phone downloads before the first paint (S28): only the
// headings' Latin subset and Geist Sans. Latin Extended (Polish letters) and
// the other files are still served, fetched when the page uses them.
const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-chakra-petch",
  display: "swap",
});

// Geist Sans / Mono cut to the characters the app shows (scripts/subset-fonts.sh):
// ~30 KB each instead of ~70 KB. Mono isn't preloaded: numbers can swap in a
// moment later.
const geistSans = localFont({
  src: "../fonts/Geist-Variable-subset.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "../fonts/GeistMono-Variable-subset.woff2",
  variable: "--font-geist-mono",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Roboto Mono", "Menlo", "Monaco", "Liberation Mono", "DejaVu Sans Mono", "Courier New", "monospace"],
  weight: "100 900",
  display: "swap",
  preload: false,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08070D",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  title: "CS2 Analyst — analiza dem CS2 i błędów w grze",
  applicationName: "CS2 Analyst",
  // PWA (S18): app/manifest.ts + public/sw.js; iOS reads these tags instead.
  appleWebApp: { capable: true, title: "CS2 Analyst", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/pwa/icon.svg", type: "image/svg+xml" }, { url: "/pwa/icon-192.png", sizes: "192x192" }],
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
  description:
    "Wybierz mecze z FACEIT albo wgraj dowolne demo CS2. Dostaniesz błędy z momentem w rundzie, podglądem 2D, radą i porównaniem z pro.",
  openGraph: {
    type: "website",
    siteName: "CS2 Analyst",
    locale: "pl_PL",
  },
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
      className={`${geistSans.variable} ${geistMono.variable} ${chakraPetch.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[var(--canvas)] font-sans antialiased">
        <I18nProvider locale={locale} messages={locale === DEFAULT_LOCALE ? undefined : MESSAGES[locale]}>
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
