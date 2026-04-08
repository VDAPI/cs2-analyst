import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      {/* Hero */}
      <div className="max-w-3xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-4 py-1.5 text-sm text-[var(--text-secondary)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--success)] animate-pulse" />
          Now in Early Access
        </div>

        <h1 className="text-5xl font-bold tracking-tight text-[var(--text-primary)] sm:text-6xl md:text-7xl">
          Analyze your{" "}
          <span className="bg-gradient-to-r from-[var(--ct-blue)] to-[var(--accent)] bg-clip-text text-transparent">
            CS2 demos
          </span>{" "}
          like a pro
        </h1>

        <p className="mt-6 text-lg leading-relaxed text-[var(--text-secondary)]">
          Upload your .dem files and unlock detailed analytics — player stats,
          heatmaps, 2D replay, economy tracking, grenade analysis, and AI-powered
          coaching insights. Built for players, coaches, and analysts.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/register"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-[var(--accent)] px-8 text-sm font-medium text-white transition-all hover:bg-[var(--accent-hover)] hover:shadow-[0_0_20px_var(--accent-glow)]"
          >
            Get Started
          </Link>
          <Link
            href="#features"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-8 text-sm font-medium text-[var(--text-secondary)] transition-all hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
          >
            See features
          </Link>
        </div>
      </div>

      {/* Feature grid placeholder */}
      <section id="features" className="mt-32 w-full max-w-6xl">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          Everything you need to improve
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6 transition-colors hover:border-[var(--border-hover)]"
            >
              <div className="mb-3 text-2xl">{f.icon}</div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-32 mb-12 text-center text-sm text-[var(--text-tertiary)]">
        CS2 Analyst © {new Date().getFullYear()} — Not affiliated with Valve Corporation.
      </footer>
    </main>
  );
}

const features = [
  {
    icon: "📊",
    title: "Player Stats",
    description:
      "K/D, ADR, HLTV 2.1 Rating, HS%, utility damage — all extracted automatically from your demos.",
  },
  {
    icon: "🔥",
    title: "Heatmaps",
    description:
      "Visualize kill positions, death clusters, and movement patterns overlaid on the map radar.",
  },
  {
    icon: "🎬",
    title: "2D Replay",
    description:
      "Canvas-based top-down replay with player positions, grenade trajectories, and round timeline.",
  },
  {
    icon: "💰",
    title: "Economy Tracker",
    description:
      "Round-by-round economy graph showing buy types, equipment values, and money management.",
  },
  {
    icon: "💣",
    title: "Grenade Analysis",
    description:
      "Smoke, flash, molotov, and HE trajectories with utility rating and effectiveness metrics.",
  },
  {
    icon: "⚔️",
    title: "Player Comparison",
    description:
      "Side-by-side comparison of players with radar charts and stat overlays across matches.",
  },
  {
    icon: "🤖",
    title: "AI Coach",
    description:
      "Automated detection of positioning mistakes, wasted utility, and timing errors with tips.",
  },
  {
    icon: "🏆",
    title: "Team Dashboard",
    description:
      "Manage your team, track trends, prepare anti-strat analyses, and share tactical boards.",
  },
  {
    icon: "🔌",
    title: "Open API",
    description:
      "RESTful API for community developers to build tools, browser extensions, and integrations.",
  },
];
