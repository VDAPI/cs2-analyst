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
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  title: "CS2 Analyst — analiza dem CS2 i błędów w grze",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pl"
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
