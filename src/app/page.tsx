import Link from "next/link";
import {
  BarChart3,
  Flame,
  Play,
  DollarSign,
  Crosshair,
  GitCompare,
  Bot,
  Trophy,
  Plug,
} from "lucide-react";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* Subtle gradient mesh background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 left-1/4 h-[800px] w-[800px] rounded-full bg-[rgba(59,130,246,0.04)] blur-[120px]" />
        <div className="absolute -bottom-1/2 right-1/4 h-[600px] w-[600px] rounded-full bg-[rgba(251,191,36,0.03)] blur-[100px]" />
      </div>

      {/* Hero */}
      <div className="relative max-w-3xl pt-24 text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-4 py-1.5 text-sm text-[var(--text-secondary)]">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--success)]" />
          Now in Early Access
        </div>

        <h1 className="text-5xl font-bold leading-[1.05] tracking-[-1.2px] text-[var(--text-primary)] sm:text-6xl md:text-7xl">
          Analyze your{" "}
          <span className="bg-gradient-to-r from-[var(--ct-blue)] to-[var(--accent)] bg-clip-text text-transparent">
            CS2 demos
          </span>{" "}
          like a pro
        </h1>

        <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[var(--text-secondary)]">
          Upload your .dem files and unlock detailed analytics — player stats,
          heatmaps, 2D replay, economy tracking, grenade analysis, and AI-powered
          coaching insights. Built for players, coaches, and analysts.
        </p>

        <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/register"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-[var(--accent)] px-8 text-sm font-medium text-white transition-all duration-150 hover:bg-[var(--accent-hover)] hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]"
          >
            Get Started
          </Link>
          <Link
            href="#features"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-8 text-sm font-medium text-[var(--text-secondary)] transition-all duration-150 hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
          >
            See features
          </Link>
        </div>
      </div>

      {/* Feature grid */}
      <section id="features" className="relative mt-32 w-full max-w-6xl pb-8">
        <h2 className="mb-16 text-center text-3xl font-bold tracking-[-0.8px] text-[var(--text-primary)]">
          Everything you need to improve
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6 transition-all duration-150 hover:border-[var(--border-hover)] hover:shadow-[0_0_30px_rgba(59,130,246,0.06)]"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-muted)] transition-colors duration-150 group-hover:bg-[rgba(59,130,246,0.2)]">
                  <Icon className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {f.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="mb-12 mt-32 text-center text-sm text-[var(--text-tertiary)]">
        CS2 Analyst &copy; {new Date().getFullYear()} — Not affiliated with Valve Corporation.
      </footer>
    </main>
  );
}

const features = [
  {
    icon: BarChart3,
    title: "Player Stats",
    description:
      "K/D, ADR, HLTV 2.1 Rating, HS%, utility damage — all extracted automatically from your demos.",
  },
  {
    icon: Flame,
    title: "Heatmaps",
    description:
      "Visualize kill positions, death clusters, and movement patterns overlaid on the map radar.",
  },
  {
    icon: Play,
    title: "2D Replay",
    description:
      "Canvas-based top-down replay with player positions, grenade trajectories, and round timeline.",
  },
  {
    icon: DollarSign,
    title: "Economy Tracker",
    description:
      "Round-by-round economy graph showing buy types, equipment values, and money management.",
  },
  {
    icon: Crosshair,
    title: "Grenade Analysis",
    description:
      "Smoke, flash, molotov, and HE trajectories with utility rating and effectiveness metrics.",
  },
  {
    icon: GitCompare,
    title: "Player Comparison",
    description:
      "Side-by-side comparison of players with radar charts and stat overlays across matches.",
  },
  {
    icon: Bot,
    title: "AI Coach",
    description:
      "Automated detection of positioning mistakes, wasted utility, and timing errors with tips.",
  },
  {
    icon: Trophy,
    title: "Team Dashboard",
    description:
      "Manage your team, track trends, prepare anti-strat analyses, and share tactical boards.",
  },
  {
    icon: Plug,
    title: "Open API",
    description:
      "RESTful API for community developers to build tools, browser extensions, and integrations.",
  },
];
