import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Card, StatCard, Badge } from "@/components/ui";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { weaponDisplayName } from "@/lib/utils/formatters";
import { detectTradeKills } from "@/lib/utils/tradeKills";
import { detectClutches } from "@/lib/utils/clutches";
import { WeaponBarChart, type WeaponStat } from "@/components/charts/weapon-bar-chart";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ steamId: string }>;
}

export default async function PlayerDetailPage({ params }: Props) {
  const { steamId } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  // Get all match entries for this player from user's demos
  const matchEntries = userId
    ? await prisma.matchPlayer.findMany({
        where: {
          steamId,
          match: { upload: { userId } },
        },
        include: {
          match: {
            select: {
              id: true,
              map: true,
              date: true,
              scoreCT: true,
              scoreT: true,
            },
          },
        },
        orderBy: { match: { date: "desc" } },
      })
    : [];

  if (matchEntries.length === 0) notFound();

  const playerName = matchEntries[0].name;

  // Aggregate stats
  const totalMatches = matchEntries.length;
  let totalKills = 0;
  let totalDeaths = 0;
  let totalAssists = 0;
  let totalAdr = 0;
  let totalHltv = 0;
  let totalHs = 0;
  let wins = 0;

  for (const entry of matchEntries) {
    totalKills += entry.kills;
    totalDeaths += entry.deaths;
    totalAssists += entry.assists;
    totalAdr += entry.adr;
    totalHltv += entry.hltvRating;
    totalHs += entry.hsPercent;

    const teamScore = entry.team === "CT" ? entry.match.scoreCT : entry.match.scoreT;
    const enemyScore = entry.team === "CT" ? entry.match.scoreT : entry.match.scoreCT;
    if (teamScore > enemyScore) wins++;
  }

  const avgKd = totalDeaths > 0 ? totalKills / totalDeaths : totalKills;
  const avgAdr = totalAdr / totalMatches;
  const avgHltv = totalHltv / totalMatches;
  const avgHs = totalHs / totalMatches;
  const winRate = Math.round((wins / totalMatches) * 100);

  // Fetch full match data for weapon / trade / clutch / multi-kill analysis
  const matches = userId
    ? await prisma.match.findMany({
        where: {
          upload: { userId },
          players: { some: { steamId } },
        },
        select: {
          id: true,
          map: true,
          date: true,
          tickRate: true,
          players: { select: { steamId: true, team: true } },
          rounds: {
            orderBy: { number: "asc" },
            select: {
              id: true,
              number: true,
              winner: true,
              kills: {
                orderBy: { tick: "asc" },
                select: {
                  id: true,
                  roundId: true,
                  tick: true,
                  attackerSteamId: true,
                  victimSteamId: true,
                  weapon: true,
                  headshot: true,
                },
              },
            },
          },
        },
      })
    : [];

  // Per-match aggregations
  const weaponAgg = new Map<string, { kills: number; headshots: number }>();
  const multiKillRounds: {
    count: number;
    weapons: string[];
    headshots: number;
    roundNumber: number;
    matchId: string;
    map: string;
    date: Date;
  }[] = [];
  let totalTradeKills = 0;
  let totalDeathsTraded = 0;
  const clutchBySize: Record<1 | 2 | 3 | 4 | 5, { won: number; attempted: number }> = {
    1: { won: 0, attempted: 0 },
    2: { won: 0, attempted: 0 },
    3: { won: 0, attempted: 0 },
    4: { won: 0, attempted: 0 },
    5: { won: 0, attempted: 0 },
  };

  for (const match of matches) {
    const teamBySteamId = new Map<string, "CT" | "T">();
    for (const p of match.players) {
      teamBySteamId.set(p.steamId, p.team as "CT" | "T");
    }

    const allKills = match.rounds.flatMap((r) => r.kills);

    // Trade kills
    const trade = detectTradeKills({
      kills: allKills,
      teamBySteamId,
      tickRate: match.tickRate,
    });
    const playerTrade = trade.perPlayer.get(steamId);
    if (playerTrade) {
      totalTradeKills += playerTrade.tradeKills;
      totalDeathsTraded += playerTrade.deathsTraded;
    }

    // Clutches
    const clutches = detectClutches({
      rounds: match.rounds.map((r) => ({
        id: r.id,
        number: r.number,
        winner: r.winner as "CT" | "T",
        kills: r.kills,
      })),
      teamBySteamId,
    });
    for (const c of clutches) {
      if (c.clutcherSteamId !== steamId) continue;
      clutchBySize[c.size].attempted++;
      if (c.won) clutchBySize[c.size].won++;
    }

    // Per-player aggregations from this player's kills only
    const playerKillsThisMatch = allKills.filter(
      (k) => k.attackerSteamId === steamId
    );

    for (const k of playerKillsThisMatch) {
      const existing = weaponAgg.get(k.weapon);
      if (existing) {
        existing.kills++;
        if (k.headshot) existing.headshots++;
      } else {
        weaponAgg.set(k.weapon, {
          kills: 1,
          headshots: k.headshot ? 1 : 0,
        });
      }
    }

    // Multi-kill rounds (this player only)
    const perRound = new Map<
      string,
      { count: number; weapons: string[]; headshots: number; roundNumber: number }
    >();
    for (const k of playerKillsThisMatch) {
      const existing = perRound.get(k.roundId);
      if (existing) {
        existing.count++;
        existing.weapons.push(k.weapon);
        if (k.headshot) existing.headshots++;
      } else {
        const round = match.rounds.find((r) => r.id === k.roundId);
        if (!round) continue;
        perRound.set(k.roundId, {
          count: 1,
          weapons: [k.weapon],
          headshots: k.headshot ? 1 : 0,
          roundNumber: round.number,
        });
      }
    }
    for (const r of perRound.values()) {
      if (r.count >= 3) {
        multiKillRounds.push({
          ...r,
          matchId: match.id,
          map: match.map,
          date: match.date,
        });
      }
    }
  }

  multiKillRounds.sort((a, b) => b.date.getTime() - a.date.getTime());

  let threeKs = 0;
  let fourKs = 0;
  let aces = 0;
  for (const r of multiKillRounds) {
    if (r.count >= 5) aces++;
    else if (r.count === 4) fourKs++;
    else threeKs++;
  }

  // Weapon bar chart data
  const weaponStats: WeaponStat[] = Array.from(weaponAgg.entries())
    .map(([weapon, { kills, headshots }]) => ({
      weapon,
      displayName: weaponDisplayName(weapon),
      kills,
      headshots,
      hsPercent: kills > 0 ? (headshots / kills) * 100 : 0,
    }))
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10);

  // Trade kill / deaths-traded percentages
  const tradeKillPct =
    totalKills > 0 ? (totalTradeKills / totalKills) * 100 : null;
  const deathsTradedPct =
    totalDeaths > 0 ? (totalDeathsTraded / totalDeaths) * 100 : null;

  // Opening duel win rate (from MatchPlayer.firstKills/firstDeaths)
  let totalFirstKills = 0;
  let totalFirstDeaths = 0;
  for (const e of matchEntries) {
    totalFirstKills += e.firstKills;
    totalFirstDeaths += e.firstDeaths;
  }
  const totalOpeningDuels = totalFirstKills + totalFirstDeaths;
  const openingDuelWr =
    totalOpeningDuels > 0 ? (totalFirstKills / totalOpeningDuels) * 100 : null;

  // Clutch totals
  let clutchesWon = 0;
  let clutchesAttempted = 0;
  for (const size of [1, 2, 3, 4, 5] as const) {
    clutchesWon += clutchBySize[size].won;
    clutchesAttempted += clutchBySize[size].attempted;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/players"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to players
      </Link>

      {/* Player header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          {playerName}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {totalMatches} match{totalMatches !== 1 ? "es" : ""} analyzed
        </p>
      </div>

      {/* Stat overview */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4">
        <StatCard label="K/D Ratio" value={avgKd.toFixed(2)} />
        <StatCard label="Avg ADR" value={avgAdr.toFixed(1)} accentColor="var(--ct-blue)" />
        <StatCard label="Avg HLTV" value={avgHltv.toFixed(2)} accentColor="var(--t-gold)" />
        <StatCard label="HS%" value={`${avgHs.toFixed(0)}%`} />
        <StatCard
          label="Win Rate"
          value={`${winRate}%`}
          accentColor="var(--success)"
        />
        <StatCard
          label="Opening Duel WR"
          value={openingDuelWr === null ? "—" : `${openingDuelWr.toFixed(0)}%`}
          accentColor="var(--accent)"
        />
        <StatCard
          label="Trade Kill %"
          value={tradeKillPct === null ? "—" : `${tradeKillPct.toFixed(0)}%`}
          accentColor="var(--info)"
        />
        <StatCard
          label="Deaths Traded %"
          value={deathsTradedPct === null ? "—" : `${deathsTradedPct.toFixed(0)}%`}
          accentColor="var(--info)"
        />
      </div>

      {/* Multi-kill stats */}
      {(threeKs > 0 || fourKs > 0 || aces > 0) && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="3K Rounds" value={threeKs} />
          <StatCard label="4K Rounds" value={fourKs} accentColor="var(--ct-blue)" />
          <StatCard label="Aces" value={aces} accentColor="var(--t-gold)" />
        </div>
      )}

      {/* Weapons */}
      {weaponStats.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
            Weapons
          </h2>
          <WeaponBarChart data={weaponStats} />
        </div>
      )}

      {/* Clutches */}
      {clutchesAttempted > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
            Clutches
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
            <StatCard
              label="Won / Attempted"
              value={`${clutchesWon}/${clutchesAttempted}`}
              accentColor="var(--success)"
            />
            {([1, 2, 3, 4, 5] as const).map((size) => {
              const c = clutchBySize[size];
              return (
                <StatCard
                  key={size}
                  label={`1v${size}`}
                  value={c.attempted === 0 ? "—" : `${c.won}/${c.attempted}`}
                  accentColor="var(--accent)"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Multi-kill highlights */}
      {multiKillRounds.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
            Multi-Kill Highlights
          </h2>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase text-[var(--text-tertiary)]">
                    <th className="px-5 py-3">Map</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3 text-center">Round</th>
                    <th className="px-3 py-3 text-center">Type</th>
                    <th className="px-3 py-3">Weapons</th>
                    <th className="px-3 py-3 text-center">HS</th>
                  </tr>
                </thead>
                <tbody>
                  {multiKillRounds.map((r, i) => {
                    const type = r.count >= 5 ? "ace" : r.count === 4 ? "4k" : "3k";
                    const uniqueWeapons = [...new Set(r.weapons)].join(", ");

                    return (
                      <tr
                        key={i}
                        className="border-t border-[var(--border)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-8 w-8 flex-shrink-0 rounded bg-[var(--surface-3)] bg-cover bg-center"
                              style={{
                                backgroundImage: `url(/maps/${r.map}_radar.png)`,
                                filter: "grayscale(40%) brightness(0.7)",
                              }}
                            />
                            <Link
                              href={`/matches/${r.matchId}`}
                              className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                            >
                              {mapDisplayName(r.map)}
                            </Link>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[var(--text-tertiary)]">
                          {r.date.toLocaleDateString()}
                        </td>
                        <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                          R{r.roundNumber}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge variant={type === "ace" ? "warning" : type === "4k" ? "ct" : "neutral"}>
                            {type === "ace" ? "ACE" : type.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-[var(--text-secondary)]">
                          {uniqueWeapons}
                        </td>
                        <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                          {r.headshots}/{r.count}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Match history */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
          Match History
        </h2>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase text-[var(--text-tertiary)]">
                  <th className="px-5 py-3">Map</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3 text-center">Result</th>
                  <th className="px-3 py-3 text-center">Score</th>
                  <th className="px-3 py-3 text-center">K</th>
                  <th className="px-3 py-3 text-center">D</th>
                  <th className="px-3 py-3 text-center">A</th>
                  <th className="px-3 py-3 text-center">ADR</th>
                  <th className="px-3 py-3 text-center">HLTV</th>
                </tr>
              </thead>
              <tbody>
                {matchEntries.map((entry) => {
                  const teamScore = entry.team === "CT" ? entry.match.scoreCT : entry.match.scoreT;
                  const enemyScore = entry.team === "CT" ? entry.match.scoreT : entry.match.scoreCT;
                  const won = teamScore > enemyScore;
                  const draw = teamScore === enemyScore;

                  return (
                    <tr
                      key={entry.id}
                      className="border-t border-[var(--border)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-8 w-8 flex-shrink-0 rounded bg-[var(--surface-3)] bg-cover bg-center"
                            style={{
                              backgroundImage: `url(/maps/${entry.match.map}_radar.png)`,
                              filter: "grayscale(40%) brightness(0.7)",
                            }}
                          />
                          <Link
                            href={`/matches/${entry.match.id}`}
                            className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                          >
                            {mapDisplayName(entry.match.map)}
                          </Link>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[var(--text-tertiary)]">
                        {entry.match.date.toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge variant={won ? "success" : draw ? "neutral" : "error"}>
                          {won ? "W" : draw ? "D" : "L"}
                        </Badge>
                      </td>
                      <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                        {teamScore}:{enemyScore}
                      </td>
                      <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                        {entry.kills}
                      </td>
                      <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                        {entry.deaths}
                      </td>
                      <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                        {entry.assists}
                      </td>
                      <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                        {entry.adr.toFixed(1)}
                      </td>
                      <td className={`stat-inline px-3 py-3 text-center font-semibold ${
                        entry.hltvRating >= 1.2
                          ? "text-[var(--success)]"
                          : entry.hltvRating >= 0.8
                            ? "text-[var(--text-primary)]"
                            : "text-[var(--error)]"
                      }`}>
                        {entry.hltvRating.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
