import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import Link from "next/link";
import { ArrowLeft, Crosshair, DollarSign, Flame, Play } from "lucide-react";
import { RoundTimeline } from "./round-timeline";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { detectMultiKills, multiKillsByRound } from "@/lib/utils/multiKills";
import { detectTradeKills } from "@/lib/utils/tradeKills";
import { detectClutches } from "@/lib/utils/clutches";

interface Props {
  params: Promise<{ matchId: string }>;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function MatchDetailPage({ params }: Props) {
  const { matchId } = await params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      players: { orderBy: { hltvRating: "desc" } },
      rounds: {
        orderBy: { number: "asc" },
        include: {
          kills: { orderBy: { tick: "asc" } },
        },
      },
    },
  });

  if (!match) notFound();

  const ctPlayers = match.players.filter((p) => p.team === "CT");
  const tPlayers = match.players.filter((p) => p.team === "T");
  const ctWon = match.scoreCT > match.scoreT;

  // Team mapping for trade / clutch detection
  const teamBySteamId = new Map<string, "CT" | "T">();
  for (const p of match.players) {
    teamBySteamId.set(p.steamId, p.team as "CT" | "T");
  }

  const allKills = match.rounds.flatMap((r) =>
    r.kills.map((k) => ({ ...k, roundId: r.id }))
  );

  // Per-player wallbang / smoke / no-scope kill counts
  const specialsBySteamId = new Map<
    string,
    { wallbangs: number; smokeKills: number; noScopeKills: number }
  >();
  for (const k of allKills) {
    if (!k.wallbang && !k.throughSmoke && !k.noScope) continue;
    let s = specialsBySteamId.get(k.attackerSteamId);
    if (!s) {
      s = { wallbangs: 0, smokeKills: 0, noScopeKills: 0 };
      specialsBySteamId.set(k.attackerSteamId, s);
    }
    if (k.wallbang) s.wallbangs++;
    if (k.throughSmoke) s.smokeKills++;
    if (k.noScope) s.noScopeKills++;
  }

  const augmentPlayer = (p: (typeof match.players)[number]) => ({
    ...p,
    wallbangs: specialsBySteamId.get(p.steamId)?.wallbangs ?? 0,
    smokeKills: specialsBySteamId.get(p.steamId)?.smokeKills ?? 0,
  });

  const trade = detectTradeKills({
    kills: allKills,
    teamBySteamId,
    tickRate: match.tickRate,
  });

  const clutches = detectClutches({
    rounds: match.rounds.map((r) => ({
      id: r.id,
      number: r.number,
      winner: r.winner as "CT" | "T",
      kills: r.kills,
    })),
    teamBySteamId,
  });

  const clutchByRoundNumber: Record<
    number,
    { steamId: string; playerName: string; team: "CT" | "T"; size: 1 | 2 | 3 | 4 | 5; won: boolean }
  > = {};
  for (const c of clutches) {
    const player = match.players.find((p) => p.steamId === c.clutcherSteamId);
    clutchByRoundNumber[c.roundNumber] = {
      steamId: c.clutcherSteamId,
      playerName: player?.name ?? c.clutcherSteamId,
      team: c.clutcherTeam,
      size: c.size,
      won: c.won,
    };
  }

  // Serialize rounds + kills for client component
  const roundsData = match.rounds.map((r) => ({
    number: r.number,
    winner: r.winner as "CT" | "T",
    winReason: r.winReason,
    buyTypeCT: r.buyType_CT as string,
    buyTypeT: r.buyType_T as string,
    kills: r.kills.map((k) => ({
      attackerSteamId: k.attackerSteamId,
      attackerName: k.attackerName,
      victimName: k.victimName,
      victimSteamId: k.victimSteamId,
      weapon: k.weapon,
      headshot: k.headshot,
      wallbang: k.wallbang,
      throughSmoke: k.throughSmoke,
      noScope: k.noScope,
      isFirstKill: k.isFirstKill,
      traded: trade.tradedKillIds.has(k.id),
      tradeKill: trade.tradeKillIds.has(k.id),
      attackerTeam: teamBySteamId.get(k.attackerSteamId) ?? null,
    })),
  }));

  // Detect multi-kills (3K, 4K, ace)
  const multiKills = detectMultiKills(roundsData);
  const multiKillMap = Object.fromEntries(multiKillsByRound(multiKills));

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/matches"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to matches
      </Link>

      {/* Match header */}
      <Card className="p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-4">
            {/* Map thumbnail */}
            <div
              className="hidden h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--surface-3)] bg-cover bg-center sm:block"
              style={{
                backgroundImage: `url(/maps/${match.map}_radar.png)`,
                filter: "grayscale(30%) brightness(0.8)",
              }}
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {mapDisplayName(match.map)}
              </h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {match.date.toLocaleDateString()}
                {match.duration > 0 && ` — ${formatDuration(match.duration)}`}
                {match.server && ` — ${match.server}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-medium uppercase text-[var(--ct-blue)]">CT</p>
              <p className={`stat-number ${ctWon ? "text-[var(--ct-blue)]" : "text-[var(--text-tertiary)]"}`}>
                {match.scoreCT}
              </p>
            </div>
            <span className="text-lg text-[var(--text-disabled)]">:</span>
            <div>
              <p className="text-xs font-medium uppercase text-[var(--t-gold)]">T</p>
              <p className={`stat-number ${!ctWon ? "text-[var(--t-gold)]" : "text-[var(--text-tertiary)]"}`}>
                {match.scoreT}
              </p>
            </div>
          </div>
        </div>

        {/* Quick nav */}
        <div className="mt-4 flex gap-2">
          <Link
            href={`/economy/${matchId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <DollarSign className="h-3.5 w-3.5" />
            Economy
          </Link>
          <Link
            href={`/heatmaps/${matchId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <Flame className="h-3.5 w-3.5" />
            Heatmap
          </Link>
          <Link
            href={`/replay/${matchId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <Play className="h-3.5 w-3.5" />
            2D Replay
          </Link>
          <Link
            href={`/grenades/${matchId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <Crosshair className="h-3.5 w-3.5" />
            Grenades
          </Link>
        </div>

        {/* Interactive round timeline */}
        {roundsData.length > 0 && (
          <RoundTimeline
            rounds={roundsData}
            multiKillMap={multiKillMap}
            clutchMap={clutchByRoundNumber}
          />
        )}
      </Card>

      {/* CT Scoreboard */}
      <ScoreboardTable
        title="Counter-Terrorists"
        teamColor="ct"
        players={ctPlayers.map(augmentPlayer)}
      />

      {/* T Scoreboard */}
      <ScoreboardTable
        title="Terrorists"
        teamColor="t"
        players={tPlayers.map(augmentPlayer)}
      />
    </div>
  );
}

function ScoreboardTable({
  title,
  teamColor,
  players,
}: {
  title: string;
  teamColor: "ct" | "t";
  players: {
    name: string;
    kills: number;
    deaths: number;
    assists: number;
    adr: number;
    hltvRating: number;
    hsPercent: number;
    firstKills: number;
    firstDeaths: number;
    wallbangs: number;
    smokeKills: number;
  }[];
}) {
  const borderColor = teamColor === "ct" ? "var(--ct-blue)" : "var(--t-gold)";
  const badgeVariant = teamColor === "ct" ? "ct" : "t";

  return (
    <Card className="overflow-hidden p-0" style={{ borderTopColor: borderColor, borderTopWidth: 2 }}>
      <div className="px-5 py-3">
        <Badge variant={badgeVariant as "ct" | "t"}>{title}</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-[var(--border)] text-left text-xs font-medium uppercase text-[var(--text-tertiary)]">
              <th className="px-5 py-2.5">Player</th>
              <th className="px-3 py-2.5 text-center">K</th>
              <th className="px-3 py-2.5 text-center">D</th>
              <th className="px-3 py-2.5 text-center">A</th>
              <th className="px-3 py-2.5 text-center">+/-</th>
              <th className="px-3 py-2.5 text-center">ADR</th>
              <th className="px-3 py-2.5 text-center">HLTV</th>
              <th className="px-3 py-2.5 text-center">HS%</th>
              <th className="px-3 py-2.5 text-center" title="Wallbang kills">WB</th>
              <th className="px-3 py-2.5 text-center" title="Through-smoke kills">SK</th>
              <th className="px-3 py-2.5 text-center">FK</th>
              <th className="px-3 py-2.5 text-center">FD</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr
                key={p.name}
                className="border-t border-[var(--border)] transition-colors hover:bg-[rgba(255,255,255,0.02)]"
              >
                <td className="px-5 py-3 font-medium text-[var(--text-primary)]">
                  {p.name}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                  {p.kills}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                  {p.deaths}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                  {p.assists}
                </td>
                <td className={`stat-inline px-3 py-3 text-center ${
                  p.kills - p.deaths > 0
                    ? "text-[var(--success)]"
                    : p.kills - p.deaths < 0
                      ? "text-[var(--error)]"
                      : "text-[var(--text-secondary)]"
                }`}>
                  {p.kills - p.deaths > 0 ? "+" : ""}{p.kills - p.deaths}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                  {p.adr.toFixed(1)}
                </td>
                <td className={`stat-inline px-3 py-3 text-center font-semibold ${
                  p.hltvRating >= 1.2
                    ? "text-[var(--success)]"
                    : p.hltvRating >= 0.8
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--error)]"
                }`}>
                  {p.hltvRating.toFixed(2)}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                  {p.hsPercent.toFixed(0)}%
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                  {p.wallbangs}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                  {p.smokeKills}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                  {p.firstKills}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                  {p.firstDeaths}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
