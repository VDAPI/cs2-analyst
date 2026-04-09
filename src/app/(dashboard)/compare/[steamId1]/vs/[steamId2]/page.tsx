import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { normalizeStat } from "@/lib/utils/normalize-stat";
import Link from "next/link";
import { ArrowLeft, ArrowRightLeft } from "lucide-react";
import { RadarComparisonChart } from "./radar-chart";
import { StatComparison } from "./stat-comparison";
import { HeadToHead } from "./head-to-head";
import { MapBreakdown } from "./map-breakdown";
import { RecentFormChart } from "./recent-form-chart";
import type { RadarDataPoint, StatRow } from "../../../types";

interface Props {
  params: Promise<{ steamId1: string; steamId2: string }>;
}

interface MatchEntry {
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  hltvRating: number;
  hsPercent: number;
  utilityDamage: number;
  flashAssists: number;
  firstKills: number;
  firstDeaths: number;
  clutchWins: number;
  clutchAttempts: number;
  match: {
    id: string;
    map: string;
    date: Date;
    scoreCT: number;
    scoreT: number;
  };
}

function aggregateStats(entries: MatchEntry[]) {
  const n = entries.length;
  let totalKills = 0,
    totalDeaths = 0,
    totalAssists = 0,
    totalAdr = 0,
    totalHltv = 0,
    totalHs = 0,
    totalUtilDmg = 0,
    totalFlashAssists = 0,
    totalFk = 0,
    totalFd = 0,
    totalClutchWins = 0,
    totalClutchAttempts = 0;

  for (const e of entries) {
    totalKills += e.kills;
    totalDeaths += e.deaths;
    totalAssists += e.assists;
    totalAdr += e.adr;
    totalHltv += e.hltvRating;
    totalHs += e.hsPercent;
    totalUtilDmg += e.utilityDamage;
    totalFlashAssists += e.flashAssists;
    totalFk += e.firstKills;
    totalFd += e.firstDeaths;
    totalClutchWins += e.clutchWins;
    totalClutchAttempts += e.clutchAttempts;
  }

  const kd = totalDeaths > 0 ? totalKills / totalDeaths : totalKills;
  const avgAdr = totalAdr / n;
  const avgHltv = totalHltv / n;
  const avgHs = totalHs / n;
  const clutchPct =
    totalClutchAttempts > 0
      ? (totalClutchWins / totalClutchAttempts) * 100
      : 0;
  const fkPerMatch = totalFk / n;

  return {
    totalKills,
    totalDeaths,
    totalAssists,
    kd,
    avgAdr,
    avgHltv,
    avgHs,
    totalUtilDmg,
    totalFlashAssists,
    totalFk,
    totalFd,
    clutchPct,
    fkPerMatch,
  };
}

function computeMapStats(entries: MatchEntry[]) {
  const byMap = new Map<
    string,
    { kills: number; deaths: number; adr: number; hltv: number; count: number }
  >();

  for (const e of entries) {
    const map = e.match.map;
    const existing = byMap.get(map);
    if (existing) {
      existing.kills += e.kills;
      existing.deaths += e.deaths;
      existing.adr += e.adr;
      existing.hltv += e.hltvRating;
      existing.count++;
    } else {
      byMap.set(map, {
        kills: e.kills,
        deaths: e.deaths,
        adr: e.adr,
        hltv: e.hltvRating,
        count: 1,
      });
    }
  }

  const result: Record<
    string,
    { matches: number; kd: number; avgAdr: number; avgHltv: number }
  > = {};

  for (const [map, data] of byMap) {
    result[map] = {
      matches: data.count,
      kd: data.deaths > 0 ? data.kills / data.deaths : data.kills,
      avgAdr: data.adr / data.count,
      avgHltv: data.hltv / data.count,
    };
  }

  return result;
}

export default async function ComparisonPage({ params }: Props) {
  const { steamId1, steamId2 } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) notFound();

  const uploadFilter = { match: { upload: { userId } } };

  // Parallel data fetching
  const [entries1, entries2, p1KillsOnP2, p2KillsOnP1] = await Promise.all([
    prisma.matchPlayer.findMany({
      where: { steamId: steamId1, ...uploadFilter },
      select: {
        kills: true,
        deaths: true,
        assists: true,
        adr: true,
        hltvRating: true,
        hsPercent: true,
        utilityDamage: true,
        flashAssists: true,
        firstKills: true,
        firstDeaths: true,
        clutchWins: true,
        clutchAttempts: true,
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
    }),
    prisma.matchPlayer.findMany({
      where: { steamId: steamId2, ...uploadFilter },
      select: {
        kills: true,
        deaths: true,
        assists: true,
        adr: true,
        hltvRating: true,
        hsPercent: true,
        utilityDamage: true,
        flashAssists: true,
        firstKills: true,
        firstDeaths: true,
        clutchWins: true,
        clutchAttempts: true,
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
    }),
    prisma.kill.count({
      where: {
        attackerSteamId: steamId1,
        victimSteamId: steamId2,
        round: { match: { upload: { userId } } },
      },
    }),
    prisma.kill.count({
      where: {
        attackerSteamId: steamId2,
        victimSteamId: steamId1,
        round: { match: { upload: { userId } } },
      },
    }),
  ]);

  if (entries1.length === 0 || entries2.length === 0) notFound();

  // Get player names from most recent entry
  const name1 = await prisma.matchPlayer.findFirst({
    where: { steamId: steamId1, ...uploadFilter },
    select: { name: true },
    orderBy: { match: { date: "desc" } },
  });
  const name2 = await prisma.matchPlayer.findFirst({
    where: { steamId: steamId2, ...uploadFilter },
    select: { name: true },
    orderBy: { match: { date: "desc" } },
  });

  const player1Name = name1?.name ?? steamId1;
  const player2Name = name2?.name ?? steamId2;

  // Compute stats
  const s1 = aggregateStats(entries1);
  const s2 = aggregateStats(entries2);

  // Radar chart data
  const radarData: RadarDataPoint[] = [
    {
      stat: "K/D",
      player1: normalizeStat("kd", s1.kd),
      player2: normalizeStat("kd", s2.kd),
      raw1: s1.kd.toFixed(2),
      raw2: s2.kd.toFixed(2),
    },
    {
      stat: "ADR",
      player1: normalizeStat("adr", s1.avgAdr),
      player2: normalizeStat("adr", s2.avgAdr),
      raw1: s1.avgAdr.toFixed(1),
      raw2: s2.avgAdr.toFixed(1),
    },
    {
      stat: "HLTV",
      player1: normalizeStat("hltv", s1.avgHltv),
      player2: normalizeStat("hltv", s2.avgHltv),
      raw1: s1.avgHltv.toFixed(2),
      raw2: s2.avgHltv.toFixed(2),
    },
    {
      stat: "HS%",
      player1: normalizeStat("hsPercent", s1.avgHs),
      player2: normalizeStat("hsPercent", s2.avgHs),
      raw1: `${s1.avgHs.toFixed(0)}%`,
      raw2: `${s2.avgHs.toFixed(0)}%`,
    },
    {
      stat: "Clutch%",
      player1: normalizeStat("clutchWinPercent", s1.clutchPct),
      player2: normalizeStat("clutchWinPercent", s2.clutchPct),
      raw1: `${s1.clutchPct.toFixed(0)}%`,
      raw2: `${s2.clutchPct.toFixed(0)}%`,
    },
    {
      stat: "FK/Match",
      player1: normalizeStat("firstKillsPerMatch", s1.fkPerMatch),
      player2: normalizeStat("firstKillsPerMatch", s2.fkPerMatch),
      raw1: s1.fkPerMatch.toFixed(1),
      raw2: s2.fkPerMatch.toFixed(1),
    },
  ];

  // Stat comparison rows
  const statRows: StatRow[] = [
    {
      label: "K/D",
      p1Value: s1.kd,
      p2Value: s2.kd,
      format: (v: number) => v.toFixed(2),
      higherIsBetter: true,
    },
    {
      label: "ADR",
      p1Value: s1.avgAdr,
      p2Value: s2.avgAdr,
      format: (v: number) => v.toFixed(1),
      higherIsBetter: true,
    },
    {
      label: "HLTV",
      p1Value: s1.avgHltv,
      p2Value: s2.avgHltv,
      format: (v: number) => v.toFixed(2),
      higherIsBetter: true,
    },
    {
      label: "HS%",
      p1Value: s1.avgHs,
      p2Value: s2.avgHs,
      format: (v: number) => `${v.toFixed(0)}%`,
      higherIsBetter: true,
    },
    {
      label: "Total Kills",
      p1Value: s1.totalKills,
      p2Value: s2.totalKills,
      format: (v: number) => v.toString(),
      higherIsBetter: true,
    },
    {
      label: "Total Deaths",
      p1Value: s1.totalDeaths,
      p2Value: s2.totalDeaths,
      format: (v: number) => v.toString(),
      higherIsBetter: false,
    },
    {
      label: "Flash Assists",
      p1Value: s1.totalFlashAssists,
      p2Value: s2.totalFlashAssists,
      format: (v: number) => v.toString(),
      higherIsBetter: true,
    },
    {
      label: "Utility Dmg",
      p1Value: s1.totalUtilDmg,
      p2Value: s2.totalUtilDmg,
      format: (v: number) => v.toString(),
      higherIsBetter: true,
    },
    {
      label: "First Kills",
      p1Value: s1.totalFk,
      p2Value: s2.totalFk,
      format: (v: number) => v.toString(),
      higherIsBetter: true,
    },
    {
      label: "First Deaths",
      p1Value: s1.totalFd,
      p2Value: s2.totalFd,
      format: (v: number) => v.toString(),
      higherIsBetter: false,
    },
  ];

  // Map breakdown
  const p1MapStats = computeMapStats(entries1);
  const p2MapStats = computeMapStats(entries2);

  // Head-to-head: count shared matches
  const p1MatchIds = new Set(entries1.map((e) => e.match.id));
  const sharedMatchCount = entries2.filter((e) => p1MatchIds.has(e.match.id)).length;

  // Recent form (last 5)
  const p1Form = entries1.slice(0, 5).map((e) => ({
    date: e.match.date.toLocaleDateString(),
    hltv: e.hltvRating,
    map: mapDisplayName(e.match.map),
  }));
  const p2Form = entries2.slice(0, 5).map((e) => ({
    date: e.match.date.toLocaleDateString(),
    hltv: e.hltvRating,
    map: mapDisplayName(e.match.map),
  }));

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <Link
        href="/compare"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to player select
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex-1 text-right">
          <h1 className="text-2xl font-bold" style={{ color: "var(--ct-blue)" }}>
            {player1Name}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            {entries1.length} match{entries1.length !== 1 ? "es" : ""}
          </p>
        </div>
        <Link
          href={`/compare/${steamId2}/vs/${steamId1}`}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-secondary)]"
          title="Swap players"
        >
          <ArrowRightLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: "var(--t-gold)" }}>
            {player2Name}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            {entries2.length} match{entries2.length !== 1 ? "es" : ""}
          </p>
        </div>
      </div>

      {/* Radar Chart */}
      <RadarComparisonChart
        player1Name={player1Name}
        player2Name={player2Name}
        data={radarData}
      />

      {/* Stat Comparison */}
      <StatComparison
        player1Name={player1Name}
        player2Name={player2Name}
        stats={statRows}
      />

      {/* Head-to-Head */}
      {sharedMatchCount > 0 && (
        <HeadToHead
          player1Name={player1Name}
          player2Name={player2Name}
          p1KillsOnP2={p1KillsOnP2}
          p2KillsOnP1={p2KillsOnP1}
          sharedMatchCount={sharedMatchCount}
        />
      )}

      {/* Map Breakdown */}
      <MapBreakdown
        player1Name={player1Name}
        player2Name={player2Name}
        player1Maps={p1MapStats}
        player2Maps={p2MapStats}
      />

      {/* Recent Form */}
      <RecentFormChart
        player1Name={player1Name}
        player2Name={player2Name}
        player1Form={p1Form}
        player2Form={p2Form}
      />
    </div>
  );
}
