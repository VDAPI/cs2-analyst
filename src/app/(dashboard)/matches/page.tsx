import { Card, StatCard } from "@/components/ui";

export default function MatchesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Matches
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Your recent CS2 match history and stats overview.
        </p>
      </div>

      {/* Stat overview row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Matches Played" value="--" />
        <StatCard label="Win Rate" value="--%" accentColor="var(--success)" />
        <StatCard label="Avg HLTV" value="--" accentColor="var(--t-gold)" />
        <StatCard label="Avg ADR" value="--" accentColor="var(--ct-blue)" />
      </div>

      {/* Match list placeholder */}
      <Card>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-[var(--text-secondary)]">
            No matches yet
          </p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">
            Upload your first demo to see match analytics here.
          </p>
        </div>
      </Card>
    </div>
  );
}
