import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, GitCompareArrows } from "lucide-react";
import { InitialsAvatar, PageHeader, StatCard, buttonVariants } from "@/components/ui";
import { resultFor } from "@/components/match";
import { BENCHMARKS, weaponDisplayName } from "@/lib/utils/formatters";
import { detectTradeKills } from "@/lib/utils/tradeKills";
import { detectClutchesBySide } from "@/lib/utils/clutches";
import { createSideResolver } from "@/lib/utils/sideSplit";
import { BUY_TYPE_COLORS, type BuyTypeKey } from "@/lib/utils/buyType";
import type { WeaponStat } from "@/components/charts/weapon-bar-chart";
import { WeaponBarChart } from "@/components/charts/lazy-charts";
import {
  BuyTypeCard,
  FormStrip,
  MapTable,
  MatchHistoryTable,
  MultiKillTable,
  Section,
  SectionNav,
  SideCard,
  ValueCard,
  WeaponTable,
  dash,
  pluralPl,
  type FormEntry,
  type HistoryRow,
} from "./profile-sections";
import { SpotsTable } from "./spots-table";
import { playerSpotStats } from "@/lib/team/spot-stats";

interface Props {
  params: Promise<{ steamId: string }>;
}

const BUY_TYPE_META: Record<"PISTOL" | "ECO" | "FORCE" | "FULL", { label: string; key: BuyTypeKey }> = {
  PISTOL: { label: "Pistol", key: "PISTOL" },
  ECO: { label: "Eco", key: "ECO" },
  FORCE: { label: "Force buy", key: "FORCE_BUY" },
  FULL: { label: "Full buy", key: "FULL_BUY" },
};

const FORM_LENGTH = 10;

export default async function PlayerDetailPage({ params }: Props) {
  const { steamId } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const spots = userId ? await playerSpotStats(prisma, userId, steamId) : [];

  // Get all match entries for this player from user's demos
  const matchEntries = userId
    ? await prisma.matchPlayer.findMany({
        where: {
          steamId,
          match: { upload: { kind: "PLAYER", userId } },
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
  let totalFlashAssists = 0;
  let totalAdr = 0;
  let totalHltv = 0;
  let totalHs = 0;
  let wins = 0;

  for (const entry of matchEntries) {
    totalKills += entry.kills;
    totalDeaths += entry.deaths;
    totalAssists += entry.assists;
    totalFlashAssists += entry.flashAssists;
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
          upload: { kind: "PLAYER", userId },
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
              ctScore: true,
              tScore: true,
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
                  wallbang: true,
                  throughSmoke: true,
                  noScope: true,
                },
              },
              players: {
                select: {
                  steamId: true,
                  buyType: true,
                  damage: true,
                  equipValue: true,
                  money: true,
                },
              },
            },
          },
        },
      })
    : [];

  // Grenades thrown by this player (across user's demos)
  const grenades = userId
    ? await prisma.grenadeEvent.findMany({
        where: {
          throwerSteamId: steamId,
          round: { match: { upload: { kind: "PLAYER", userId } } },
        },
        select: {
          grenadeType: true,
          damageDealt: true,
          playersFlashed: true,
        },
      })
    : [];

  // Per-match aggregations
  const weaponAgg = new Map<string, { kills: number; headshots: number }>();
  let totalWallbangs = 0;
  let totalSmokeKills = 0;
  let totalNoScopeKills = 0;
  let totalGapSeconds = 0;
  let totalGaps = 0;
  const sideStats: Record<"CT" | "T", { kills: number; deaths: number; headshots: number }> = {
    CT: { kills: 0, deaths: 0, headshots: 0 },
    T: { kills: 0, deaths: 0, headshots: 0 },
  };

  // Per-buy-type performance
  type BuyTypeStats = {
    rounds: number;
    won: number;
    kills: number;
    deaths: number;
    headshots: number;
    damage: number;
  };
  const buyTypeStats: Record<"PISTOL" | "ECO" | "FORCE" | "FULL", BuyTypeStats> = {
    PISTOL: { rounds: 0, won: 0, kills: 0, deaths: 0, headshots: 0, damage: 0 },
    ECO: { rounds: 0, won: 0, kills: 0, deaths: 0, headshots: 0, damage: 0 },
    FORCE: { rounds: 0, won: 0, kills: 0, deaths: 0, headshots: 0, damage: 0 },
    FULL: { rounds: 0, won: 0, kills: 0, deaths: 0, headshots: 0, damage: 0 },
  };
  let antiEcoAttempts = 0;
  let antiEcoWins = 0;

  // Save round detection
  let saveCount = 0;
  let savePaidOff = 0;
  let saveTotalEquip = 0;
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
    // MatchPlayer.team is the side the player finished on — resolve the side
    // played in each round (halves, overtime) before comparing with winners.
    const sideAt = createSideResolver(match.rounds);
    const clutches = detectClutchesBySide({
      rounds: match.rounds.map((r) => ({
        id: r.id,
        number: r.number,
        winner: r.winner as "CT" | "T",
        kills: r.kills,
      })),
      finalTeamBySteamId: teamBySteamId,
      sideAt,
    });
    for (const c of clutches) {
      if (c.clutcherSteamId !== steamId) continue;
      clutchBySize[c.size].attempted++;
      if (c.won) clutchBySize[c.size].won++;
    }

    // Per-player aggregations from this player's kills only
    // Enemy kills only: suicides / world deaths and team kills are not frags.
    const isEnemyKill = (k: { attackerSteamId: string; victimSteamId: string }) =>
      k.attackerSteamId !== k.victimSteamId &&
      teamBySteamId.get(k.attackerSteamId) !== teamBySteamId.get(k.victimSteamId);
    const playerKillsThisMatch = allKills.filter(
      (k) => k.attackerSteamId === steamId && isEnemyKill(k)
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
      if (k.wallbang) totalWallbangs++;
      if (k.throughSmoke) totalSmokeKills++;
      if (k.noScope) totalNoScopeKills++;
    }

    // Side split: walk all kills involving this player
    const playerMatchTeam = match.players.find((p) => p.steamId === steamId)
      ?.team as "CT" | "T" | undefined;
    if (playerMatchTeam) {
      for (const round of match.rounds) {
        const side = sideAt(playerMatchTeam, round.number);
        for (const k of round.kills) {
          if (k.attackerSteamId === steamId && isEnemyKill(k)) {
            sideStats[side].kills++;
            if (k.headshot) sideStats[side].headshots++;
          }
          if (k.victimSteamId === steamId) {
            sideStats[side].deaths++;
          }
        }
      }
    }

    // Per-buy-type performance + anti-eco + save rounds
    if (playerMatchTeam) {
      const enemySteamIds = new Set(
        match.players.filter((p) => p.team !== playerMatchTeam).map((p) => p.steamId)
      );

      const sortedRounds = [...match.rounds].sort((a, b) => a.number - b.number);

      for (let i = 0; i < sortedRounds.length; i++) {
        const round = sortedRounds[i];
        const playerRP = round.players.find((rp) => rp.steamId === steamId);
        if (!playerRP) continue;

        const side = sideAt(playerMatchTeam, round.number);
        const won = round.winner === side;

        const bucket: keyof typeof buyTypeStats | null = (() => {
          switch (playerRP.buyType) {
            case "PISTOL":
              return "PISTOL";
            case "ECO":
              return "ECO";
            case "HALF_BUY":
            case "FORCE_BUY":
              return "FORCE";
            case "FULL_BUY":
              return "FULL";
            default:
              return null;
          }
        })();

        const playerKillsInRound = round.kills.filter(
          (k) => k.attackerSteamId === steamId && isEnemyKill(k)
        );
        const playerDeathsInRound = round.kills.filter(
          (k) => k.victimSteamId === steamId
        );

        if (bucket) {
          const s = buyTypeStats[bucket];
          s.rounds++;
          if (won) s.won++;
          s.kills += playerKillsInRound.length;
          s.headshots += playerKillsInRound.filter((k) => k.headshot).length;
          s.deaths += playerDeathsInRound.length;
          s.damage += playerRP.damage;
        }

        // Anti-eco: player FULL_BUY vs enemy team majority ECO
        if (playerRP.buyType === "FULL_BUY") {
          const enemyRPs = round.players.filter((rp) =>
            enemySteamIds.has(rp.steamId)
          );
          const enemyEcoCount = enemyRPs.filter((rp) => rp.buyType === "ECO").length;
          if (enemyRPs.length > 0 && enemyEcoCount > enemyRPs.length / 2) {
            antiEcoAttempts++;
            if (won) antiEcoWins++;
          }
        }

        // Save round: round lost, player didn't engage and didn't die,
        // had non-trivial equip preserved.
        if (
          !won &&
          playerKillsInRound.length === 0 &&
          playerDeathsInRound.length === 0 &&
          playerRP.equipValue >= 1500
        ) {
          saveCount++;
          saveTotalEquip += playerRP.equipValue;
          const next = sortedRounds[i + 1];
          if (next) {
            const nextRP = next.players.find((rp) => rp.steamId === steamId);
            if (nextRP && nextRP.equipValue >= 4000) savePaidOff++;
          }
        }

      }
    }

    // Multi-kill rounds + engagement-speed gaps (this player only)
    const perRound = new Map<
      string,
      {
        count: number;
        weapons: string[];
        headshots: number;
        roundNumber: number;
        ticks: number[];
      }
    >();
    for (const k of playerKillsThisMatch) {
      const existing = perRound.get(k.roundId);
      if (existing) {
        existing.count++;
        existing.weapons.push(k.weapon);
        existing.ticks.push(k.tick);
        if (k.headshot) existing.headshots++;
      } else {
        const round = match.rounds.find((r) => r.id === k.roundId);
        if (!round) continue;
        perRound.set(k.roundId, {
          count: 1,
          weapons: [k.weapon],
          headshots: k.headshot ? 1 : 0,
          roundNumber: round.number,
          ticks: [k.tick],
        });
      }
    }
    for (const r of perRound.values()) {
      // Engagement speed: gaps between consecutive kills in same round
      if (r.ticks.length >= 2) {
        const sorted = [...r.ticks].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          totalGapSeconds += (sorted[i] - sorted[i - 1]) / match.tickRate;
          totalGaps++;
        }
      }
      if (r.count >= 3) {
        multiKillRounds.push({
          count: r.count,
          weapons: r.weapons,
          headshots: r.headshots,
          roundNumber: r.roundNumber,
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

  // Special-kill percentages
  const wallbangPct = totalKills > 0 ? (totalWallbangs / totalKills) * 100 : null;
  const smokeKillPct = totalKills > 0 ? (totalSmokeKills / totalKills) * 100 : null;
  const noScopePct = totalKills > 0 ? (totalNoScopeKills / totalKills) * 100 : null;

  // Engagement speed: average seconds between consecutive same-round kills
  const avgEngagementSpeed = totalGaps > 0 ? totalGapSeconds / totalGaps : null;

  // Utility efficiency from grenades
  // NOTE: avg flash duration on enemies and "unused utility on death" require
  // parser changes (no per-tick inventory or flash duration in schema).
  const utilAgg = {
    flashCount: 0,
    flashedTotal: 0,
    heCount: 0,
    heDmg: 0,
    mollyCount: 0,
    mollyDmg: 0,
    smokeCount: 0,
    decoyCount: 0,
  };
  for (const g of grenades) {
    switch (g.grenadeType) {
      case "FLASH":
        utilAgg.flashCount++;
        utilAgg.flashedTotal += g.playersFlashed;
        break;
      case "HE":
        utilAgg.heCount++;
        utilAgg.heDmg += g.damageDealt;
        break;
      case "MOLOTOV":
      case "INCENDIARY":
        utilAgg.mollyCount++;
        utilAgg.mollyDmg += g.damageDealt;
        break;
      case "SMOKE":
        utilAgg.smokeCount++;
        break;
      case "DECOY":
        utilAgg.decoyCount++;
        break;
    }
  }
  const totalUtility =
    utilAgg.flashCount +
    utilAgg.heCount +
    utilAgg.mollyCount +
    utilAgg.smokeCount +
    utilAgg.decoyCount;
  const avgFlashEff =
    utilAgg.flashCount > 0 ? utilAgg.flashedTotal / utilAgg.flashCount : null;
  const avgHeDmg = utilAgg.heCount > 0 ? utilAgg.heDmg / utilAgg.heCount : null;
  const avgMollyDmg =
    utilAgg.mollyCount > 0 ? utilAgg.mollyDmg / utilAgg.mollyCount : null;

  // Side split derived
  const sideKD: Record<"CT" | "T", { kd: number | null; hsPct: number | null }> = {
    CT: {
      kd:
        sideStats.CT.deaths > 0
          ? sideStats.CT.kills / sideStats.CT.deaths
          : sideStats.CT.kills > 0
            ? sideStats.CT.kills
            : null,
      hsPct:
        sideStats.CT.kills > 0
          ? (sideStats.CT.headshots / sideStats.CT.kills) * 100
          : null,
    },
    T: {
      kd:
        sideStats.T.deaths > 0
          ? sideStats.T.kills / sideStats.T.deaths
          : sideStats.T.kills > 0
            ? sideStats.T.kills
            : null,
      hsPct:
        sideStats.T.kills > 0
          ? (sideStats.T.headshots / sideStats.T.kills) * 100
          : null,
    },
  };
  const hasSideData =
    sideStats.CT.kills + sideStats.CT.deaths + sideStats.T.kills + sideStats.T.deaths > 0;

  // Per-map breakdown
  const mapAgg = new Map<
    string,
    {
      matches: number;
      wins: number;
      kills: number;
      deaths: number;
      adrSum: number;
      hltvSum: number;
    }
  >();
  for (const entry of matchEntries) {
    const teamScore = entry.team === "CT" ? entry.match.scoreCT : entry.match.scoreT;
    const enemyScore = entry.team === "CT" ? entry.match.scoreT : entry.match.scoreCT;
    const won = teamScore > enemyScore;
    const existing = mapAgg.get(entry.match.map);
    if (existing) {
      existing.matches++;
      if (won) existing.wins++;
      existing.kills += entry.kills;
      existing.deaths += entry.deaths;
      existing.adrSum += entry.adr;
      existing.hltvSum += entry.hltvRating;
    } else {
      mapAgg.set(entry.match.map, {
        matches: 1,
        wins: won ? 1 : 0,
        kills: entry.kills,
        deaths: entry.deaths,
        adrSum: entry.adr,
        hltvSum: entry.hltvRating,
      });
    }
  }
  const mapStats = Array.from(mapAgg.entries())
    .map(([map, s]) => ({
      map,
      matches: s.matches,
      winRate: (s.wins / s.matches) * 100,
      kd: s.deaths > 0 ? s.kills / s.deaths : s.kills,
      avgAdr: s.adrSum / s.matches,
      avgHltv: s.hltvSum / s.matches,
    }))
    .sort((a, b) => b.matches - a.matches);

  // Per-buy-type derived stats
  const buyTypePerf = (Object.keys(buyTypeStats) as Array<keyof typeof buyTypeStats>).map(
    (key) => {
      const s = buyTypeStats[key];
      return {
        key,
        rounds: s.rounds,
        kd:
          s.deaths > 0
            ? s.kills / s.deaths
            : s.kills > 0
              ? s.kills
              : null,
        adr: s.rounds > 0 ? s.damage / s.rounds : null,
        hsPct: s.kills > 0 ? (s.headshots / s.kills) * 100 : null,
        winRate: s.rounds > 0 ? (s.won / s.rounds) * 100 : null,
      };
    }
  );
  const hasBuyTypeData = buyTypePerf.some((b) => b.rounds > 0);
  const antiEcoWinRate =
    antiEcoAttempts > 0 ? (antiEcoWins / antiEcoAttempts) * 100 : null;
  const avgSaveEquip = saveCount > 0 ? saveTotalEquip / saveCount : null;
  const savePaidOffPct = saveCount > 0 ? (savePaidOff / saveCount) * 100 : null;

  // Best/worst by HLTV (only label when we have at least 2 maps with 2+ matches)
  const eligibleMaps = mapStats.filter((m) => m.matches >= 2);
  const bestMap =
    eligibleMaps.length >= 2
      ? eligibleMaps.reduce((b, m) => (m.avgHltv > b.avgHltv ? m : b)).map
      : null;
  const worstMap =
    eligibleMaps.length >= 2
      ? eligibleMaps.reduce((w, m) => (m.avgHltv < w.avgHltv ? m : w)).map
      : null;


  // Match history rows + recent form (matchEntries are newest first)
  const historyRows: HistoryRow[] = matchEntries.map((entry) => {
    const teamScore = entry.team === "CT" ? entry.match.scoreCT : entry.match.scoreT;
    const enemyScore = entry.team === "CT" ? entry.match.scoreT : entry.match.scoreCT;
    return {
      id: entry.id,
      matchId: entry.match.id,
      map: entry.match.map,
      date: entry.match.date,
      result: resultFor(entry.team, entry.match.scoreCT, entry.match.scoreT),
      teamScore,
      enemyScore,
      kills: entry.kills,
      deaths: entry.deaths,
      assists: entry.assists,
      adr: entry.adr,
      rating: entry.hltvRating,
    };
  });
  const formEntries: FormEntry[] = historyRows.slice(0, FORM_LENGTH).map((r) => ({
    matchId: r.matchId,
    map: r.map,
    date: r.date,
    result: r.result,
    rating: r.rating,
    score: `${r.teamScore}:${r.enemyScore}`,
  }));
  const formWins = formEntries.filter((e) => e.result === "W").length;
  const formAvgRating =
    formEntries.length > 0 ? formEntries.reduce((s, e) => s + e.rating, 0) / formEntries.length : 0;

  // The single strongest headline stat (relative to the "good" benchmark) gets the lime highlight
  const strengths = {
    hltv: avgHltv / BENCHMARKS.hltvRating.good,
    adr: avgAdr / BENCHMARKS.adr.good,
    kd: avgKd / BENCHMARKS.kd.good,
    hs: avgHs / 100 / BENCHMARKS.hsPercent.good,
  };
  const bestStat = (Object.keys(strengths) as Array<keyof typeof strengths>).reduce((a, b) =>
    strengths[b] > strengths[a] ? b : a
  );
  const bestHint = "Najmocniejsza statystyka";

  const hasMultiKills = threeKs > 0 || fourKs > 0 || aces > 0;
  const hasStyle = hasMultiKills || totalKills > 0;

  const navItems = [
    { id: "przeglad", label: "Przegląd", show: true },
    { id: "forma", label: "Forma", show: formEntries.length > 0 },
    { id: "strony", label: "CT / T", show: hasSideData },
    { id: "ekonomia", label: "Ekonomia", show: hasBuyTypeData },
    { id: "styl", label: "Styl gry", show: hasStyle },
    { id: "bronie", label: "Bronie", show: weaponStats.length > 0 },
    { id: "clutche", label: "Clutche", show: clutchesAttempted > 0 },
    { id: "granaty", label: "Granaty", show: totalUtility > 0 },
    { id: "multikille", label: "Multi-kille", show: multiKillRounds.length > 0 },
    { id: "mapy", label: "Mapy", show: mapStats.length > 0 },
    { id: "mecze", label: "Mecze", show: true },
  ].filter((i) => i.show);

  const antiEcoColor =
    antiEcoWinRate === null
      ? "var(--text-disabled)"
      : antiEcoWinRate >= 85
        ? "var(--good)"
        : antiEcoWinRate < 70
          ? "var(--mistake)"
          : "var(--warning)";
  const antiEcoValueClass =
    antiEcoWinRate === null
      ? "text-[var(--text-disabled)]"
      : antiEcoWinRate >= 85
        ? "text-[var(--good)]"
        : antiEcoWinRate < 70
          ? "text-[var(--mistake)]"
          : "text-[var(--text-primary)]";

  const pct0 = (n: number) => `${n.toFixed(0)}%`;
  const pct1 = (n: number) => `${n.toFixed(1)}%`;

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: "/players", label: "Gracze" }}
        eyebrow="Profil gracza"
        title={
          <span className="flex min-w-0 items-center gap-3">
            <InitialsAvatar name={playerName} size="lg" />
            <span className="min-w-0 truncate">{playerName}</span>
          </span>
        }
        description={
          <>
            <span className="font-mono tabular-nums">{totalMatches}</span>{" "}
            {pluralPl(totalMatches, "przeanalizowany mecz", "przeanalizowane mecze", "przeanalizowanych meczów")}
            <span aria-hidden> · </span>
            <span className="break-all font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
              SteamID {steamId}
            </span>
          </>
        }
        actions={
          <>
            <Link href={`/compare?p1=${steamId}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <GitCompareArrows className="h-4 w-4" aria-hidden />
              Porównaj
            </Link>
            <a
              href={`https://steamcommunity.com/profiles/${steamId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Profil Steam
            </a>
          </>
        }
      />

      <SectionNav items={navItems} />

      {/* Overview */}
      <Section id="przeglad" title="Przegląd" description="Sumy i średnie ze wszystkich meczów tego gracza.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 xl:grid-cols-5">
          <StatCard
            className="col-span-2 sm:col-span-1"
            label="K / D / A"
            value={`${totalKills} / ${totalDeaths} / ${totalAssists}`}
            hint="Zabójstwa / śmierci / asysty"
          />
          <StatCard
            label="K/D"
            value={avgKd.toFixed(2)}
            highlight={bestStat === "kd"}
            hint={bestStat === "kd" ? bestHint : undefined}
          />
          {/* Disjoint from assists by design — see CLAUDE.md */}
          <StatCard label="Flash asysty" value={totalFlashAssists} hint="Liczone osobno od asyst" />
          <StatCard
            label="Śr. ADR"
            value={avgAdr.toFixed(1)}
            highlight={bestStat === "adr"}
            hint={bestStat === "adr" ? bestHint : undefined}
          />
          <StatCard
            label="Śr. rating HLTV"
            value={avgHltv.toFixed(2)}
            highlight={bestStat === "hltv"}
            hint={bestStat === "hltv" ? bestHint : undefined}
          />
          <StatCard
            label="HS%"
            value={`${avgHs.toFixed(0)}%`}
            highlight={bestStat === "hs"}
            hint={bestStat === "hs" ? bestHint : undefined}
          />
          <StatCard label="Wygrane mecze" value={`${winRate}%`} hint={`${wins} z ${totalMatches}`} />
          <StatCard
            label="Otwierające pojedynki"
            value={dash(openingDuelWr, pct0)}
            hint={`Wygrane: ${totalFirstKills}/${totalOpeningDuels}`}
          />
          <StatCard
            label="Trade kill %"
            value={dash(tradeKillPct, pct0)}
            hint="Zabójstwa, które pomściły kolegę"
          />
          <StatCard
            label="Śmierci pomszczone %"
            value={dash(deathsTradedPct, pct0)}
            hint="Twoje śmierci wymienione przez drużynę"
          />
        </div>
      </Section>

      {/* Recent form */}
      {formEntries.length > 0 && (
        <Section
          id="forma"
          title="Forma"
          description={`Ostatnie ${formEntries.length} ${pluralPl(formEntries.length, "mecz", "mecze", "meczów")}, od najnowszego.`}
        >
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--text-secondary)]">
            <span>
              Bilans:{" "}
              <span className="font-mono tabular-nums text-[var(--text-primary)]">
                {formWins}–{formEntries.length - formWins}
              </span>
            </span>
            <span>
              Śr. rating:{" "}
              <span className="font-mono tabular-nums text-[var(--text-primary)]">{formAvgRating.toFixed(2)}</span>
            </span>
          </div>
          <FormStrip entries={formEntries} />
        </Section>
      )}

      {/* Side split */}
      {hasSideData && (
        <Section id="strony" title="Strona CT vs T" description="Zabójstwa i śmierci z podziałem na połowy.">
          <div className="grid gap-3 sm:grid-cols-2 md:gap-4">
            <SideCard side="CT" stats={sideStats.CT} kd={sideKD.CT.kd} hsPct={sideKD.CT.hsPct} />
            <SideCard side="T" stats={sideStats.T} kd={sideKD.T.kd} hsPct={sideKD.T.hsPct} />
          </div>
        </Section>
      )}

      {/* Performance by economy */}
      {hasBuyTypeData && (
        <Section id="ekonomia" title="Wyniki wg ekonomii" description="Jak grasz w zależności od tego, za ile kupiłeś.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 xl:grid-cols-5">
            {buyTypePerf.map((b) => (
              <BuyTypeCard
                key={b.key}
                label={BUY_TYPE_META[b.key].label}
                color={BUY_TYPE_COLORS[BUY_TYPE_META[b.key].key]}
                rounds={b.rounds}
                kd={b.kd}
                adr={b.adr}
                hsPct={b.hsPct}
                winRate={b.winRate}
              />
            ))}
            <ValueCard
              label="Anti-eco WR"
              value={dash(antiEcoWinRate, pct0)}
              sub={`${antiEcoWins}/${antiEcoAttempts} ${pluralPl(antiEcoAttempts, "runda", "rundy", "rund")}`}
              color={antiEcoColor}
              valueClassName={antiEcoValueClass}
            />
          </div>
          {saveCount > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:mt-4 md:gap-4">
              <StatCard label="Rundy save" value={saveCount} accentColor="var(--info)" />
              <StatCard
                label="Śr. zachowany sprzęt"
                value={avgSaveEquip === null ? "—" : `$${Math.round(avgSaveEquip)}`}
                accentColor="var(--info)"
              />
              <StatCard
                className="col-span-2 sm:col-span-1"
                label="Udane save'y"
                value={dash(savePaidOffPct, pct0)}
                hint="Pełny zakup w następnej rundzie"
                accentColor="var(--good)"
              />
            </div>
          )}
        </Section>
      )}

      {/* Style — multi-kills, special-kill % + engagement speed */}
      {hasStyle && (
        <Section id="styl" title="Styl gry">
          {hasMultiKills && (
            <div className="grid grid-cols-3 gap-3 md:gap-4">
              <StatCard label="Rundy 3K" value={threeKs} />
              <StatCard label="Rundy 4K" value={fourKs} />
              <StatCard label="Ace" value={aces} />
            </div>
          )}
          {totalKills > 0 && (
            <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4 ${hasMultiKills ? "mt-3 md:mt-4" : ""}`}>
              <StatCard label="Wallbang %" value={dash(wallbangPct, pct1)} />
              <StatCard label="Przez smoke %" value={dash(smokeKillPct, pct1)} accentColor="var(--smoke)" />
              <StatCard label="No-scope %" value={dash(noScopePct, pct1)} />
              <StatCard
                label="Tempo zabójstw"
                value={avgEngagementSpeed === null ? "—" : `${avgEngagementSpeed.toFixed(1)}s`}
                hint="Śr. odstęp między kolejnymi killami w rundzie"
              />
            </div>
          )}
        </Section>
      )}

      {/* Weapons */}
      {weaponStats.length > 0 && (
        <Section id="bronie" title="Bronie" description="Top 10 broni wg zabójstw.">
          <div className="grid gap-3 md:gap-4 lg:grid-cols-[3fr_2fr]">
            <WeaponBarChart data={weaponStats} />
            <WeaponTable data={weaponStats} />
          </div>
        </Section>
      )}

      {/* Clutches */}
      {clutchesAttempted > 0 && (
        <Section id="clutche" title="Clutche">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 xl:grid-cols-6">
            <StatCard
              label="Wygrane / próby"
              value={`${clutchesWon}/${clutchesAttempted}`}
              accentColor="var(--good)"
            />
            {([1, 2, 3, 4, 5] as const).map((size) => {
              const c = clutchBySize[size];
              return (
                <StatCard
                  key={size}
                  label={`1v${size}`}
                  value={c.attempted === 0 ? "—" : `${c.won}/${c.attempted}`}
                />
              );
            })}
          </div>
        </Section>
      )}

      {/* Utility efficiency */}
      {totalUtility > 0 && (
        <Section id="granaty" title="Skuteczność granatów">
          <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            <StatCard
              label="Skuteczność flashy"
              value={avgFlashEff === null ? "—" : avgFlashEff.toFixed(2)}
              hint="Oślepionych na flasha"
              accentColor="var(--flash)"
            />
            <StatCard
              label="Obrażenia HE / granat"
              value={avgHeDmg === null ? "—" : avgHeDmg.toFixed(0)}
              accentColor="var(--he)"
            />
            <StatCard
              label="Obrażenia molotova / granat"
              value={avgMollyDmg === null ? "—" : avgMollyDmg.toFixed(0)}
              accentColor="var(--molotov)"
            />
            <ValueCard
              label="Rzucone granaty"
              value={totalUtility}
              sub={
                <>
                  Flash {utilAgg.flashCount} · HE {utilAgg.heCount} · Molo {utilAgg.mollyCount} · Smoke{" "}
                  {utilAgg.smokeCount}
                  {utilAgg.decoyCount > 0 ? ` · Decoy ${utilAgg.decoyCount}` : ""}
                </>
              }
            />
          </div>
        </Section>
      )}

      {/* Multi-kill highlights */}
      {multiKillRounds.length > 0 && (
        <Section id="multikille" title="Najlepsze multi-kille" description="Rundy z 3+ zabójstwami, od najnowszych.">
          <MultiKillTable rows={multiKillRounds} />
        </Section>
      )}

      {/* Map performance */}
      {mapStats.length > 0 && (
        <Section id="mapy" title="Wyniki na mapach">
          <MapTable rows={mapStats} bestMap={bestMap} worstMap={worstMap} />
        </Section>
      )}

      {/* Kills and deaths per position: which angles work */}
      {spots.length > 0 && (
        <Section
          id="pozycje"
          title="Pozycje: zabójstwa i śmierci"
          description="Skąd gracz zabija i gdzie ginie, na mapę i stronę. Czerwone pozycje częściej kończą się śmiercią niż fragiem, zielone działają. Nazwy pozycji poprawisz na mapie pozycji."
        >
          <SpotsTable rows={spots} />
        </Section>
      )}

      {/* Match history */}
      <Section id="mecze" title="Historia meczów">
        <MatchHistoryTable rows={historyRows} />
      </Section>
    </div>
  );
}
