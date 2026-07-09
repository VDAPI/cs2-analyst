import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Card, StatCard, Badge } from "@/components/ui";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { weaponDisplayName } from "@/lib/utils/formatters";
import { detectTradeKills } from "@/lib/utils/tradeKills";
import { detectClutches } from "@/lib/utils/clutches";
import { playerSideAtRound } from "@/lib/utils/sideSplit";
import { BUY_TYPE_COLORS, type BuyTypeKey } from "@/lib/utils/buyType";
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
          round: { match: { upload: { userId } } },
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
      if (k.wallbang) totalWallbangs++;
      if (k.throughSmoke) totalSmokeKills++;
      if (k.noScope) totalNoScopeKills++;
    }

    // Side split: walk all kills involving this player
    const playerMatchTeam = match.players.find((p) => p.steamId === steamId)
      ?.team as "CT" | "T" | undefined;
    if (playerMatchTeam) {
      for (const round of match.rounds) {
        const side = playerSideAtRound(playerMatchTeam, round.number);
        for (const k of round.kills) {
          if (k.attackerSteamId === steamId) {
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

        const side = playerSideAtRound(playerMatchTeam, round.number);
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
          (k) => k.attackerSteamId === steamId
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
        <StatCard
          label="K / D / A"
          value={`${totalKills} / ${totalDeaths} / ${totalAssists}`}
        />
        <StatCard label="K/D Ratio" value={avgKd.toFixed(2)} />
        {/* Disjoint from assists by design — see CLAUDE.md */}
        <StatCard
          label="Flash Assists"
          value={totalFlashAssists}
          accentColor="var(--t-gold)"
        />
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

      {/* Side split */}
      {hasSideData && (
        <div className="grid gap-4 sm:grid-cols-2">
          <SideCard
            label="CT Side"
            color="var(--ct-blue)"
            stats={sideStats.CT}
            kd={sideKD.CT.kd}
            hsPct={sideKD.CT.hsPct}
          />
          <SideCard
            label="T Side"
            color="var(--t-gold)"
            stats={sideStats.T}
            kd={sideKD.T.kd}
            hsPct={sideKD.T.hsPct}
          />
        </div>
      )}

      {/* Performance by Economy */}
      {hasBuyTypeData && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
            Performance by Economy
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {buyTypePerf.map((b) => (
              <BuyTypeCard
                key={b.key}
                label={
                  b.key === "FULL"
                    ? "Full Buy"
                    : b.key === "FORCE"
                      ? "Force Buy"
                      : b.key === "ECO"
                        ? "Eco"
                        : "Pistol"
                }
                color={
                  BUY_TYPE_COLORS[
                    (b.key === "FULL"
                      ? "FULL_BUY"
                      : b.key === "FORCE"
                        ? "FORCE_BUY"
                        : b.key === "ECO"
                          ? "ECO"
                          : "PISTOL") as BuyTypeKey
                  ]
                }
                rounds={b.rounds}
                kd={b.kd}
                adr={b.adr}
                hsPct={b.hsPct}
                winRate={b.winRate}
              />
            ))}
            <Card
              className="border-t-2"
              style={{
                borderTopColor:
                  antiEcoWinRate === null
                    ? "var(--text-disabled)"
                    : antiEcoWinRate >= 85
                      ? "var(--success)"
                      : antiEcoWinRate < 70
                        ? "var(--error)"
                        : "var(--warning)",
              }}
            >
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                Anti-Eco WR
              </p>
              <p
                className={`stat-number mt-2 ${
                  antiEcoWinRate === null
                    ? "text-[var(--text-disabled)]"
                    : antiEcoWinRate >= 85
                      ? "text-[var(--success)]"
                      : antiEcoWinRate < 70
                        ? "text-[var(--error)]"
                        : "text-[var(--text-primary)]"
                }`}
              >
                {antiEcoWinRate === null
                  ? "—"
                  : `${antiEcoWinRate.toFixed(0)}%`}
              </p>
              <p className="mt-1 font-mono text-xs text-[var(--text-tertiary)]">
                {antiEcoWins}/{antiEcoAttempts} rounds
              </p>
            </Card>
          </div>
          {saveCount > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-4">
              <StatCard
                label="Save Rounds"
                value={saveCount}
                accentColor="var(--info)"
              />
              <StatCard
                label="Avg Equip Saved"
                value={avgSaveEquip === null ? "—" : `$${Math.round(avgSaveEquip)}`}
                accentColor="var(--info)"
              />
              <StatCard
                label="Saves Paid Off"
                value={
                  savePaidOffPct === null ? "—" : `${savePaidOffPct.toFixed(0)}%`
                }
                accentColor="var(--success)"
              />
            </div>
          )}
        </div>
      )}

      {/* Multi-kill stats */}
      {(threeKs > 0 || fourKs > 0 || aces > 0) && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="3K Rounds" value={threeKs} />
          <StatCard label="4K Rounds" value={fourKs} accentColor="var(--ct-blue)" />
          <StatCard label="Aces" value={aces} accentColor="var(--t-gold)" />
        </div>
      )}

      {/* Style — special-kill % + engagement speed */}
      {totalKills > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Wallbang %"
            value={wallbangPct === null ? "—" : `${wallbangPct.toFixed(1)}%`}
            accentColor="var(--accent)"
          />
          <StatCard
            label="Smoke Kill %"
            value={smokeKillPct === null ? "—" : `${smokeKillPct.toFixed(1)}%`}
            accentColor="var(--smoke)"
          />
          <StatCard
            label="No-Scope %"
            value={noScopePct === null ? "—" : `${noScopePct.toFixed(1)}%`}
            accentColor="var(--warning)"
          />
          <StatCard
            label="Engagement Speed"
            value={
              avgEngagementSpeed === null
                ? "—"
                : `${avgEngagementSpeed.toFixed(1)}s`
            }
            accentColor="var(--info)"
          />
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

      {/* Utility efficiency */}
      {totalUtility > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
            Utility Efficiency
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Flash Effectiveness"
              value={avgFlashEff === null ? "—" : avgFlashEff.toFixed(2)}
              accentColor="var(--flash)"
            />
            <StatCard
              label="HE Damage / Nade"
              value={avgHeDmg === null ? "—" : avgHeDmg.toFixed(0)}
              accentColor="var(--he)"
            />
            <StatCard
              label="Molly Damage / Nade"
              value={avgMollyDmg === null ? "—" : avgMollyDmg.toFixed(0)}
              accentColor="var(--molotov)"
            />
            <Card
              className="border-t-2"
              style={{ borderTopColor: "var(--accent)" }}
            >
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                Total Utility Thrown
              </p>
              <p className="stat-number mt-2 text-[var(--text-primary)]">
                {totalUtility}
              </p>
              <p className="mt-1 font-mono text-xs text-[var(--text-tertiary)]">
                F: {utilAgg.flashCount} · HE: {utilAgg.heCount} · M: {utilAgg.mollyCount} · S: {utilAgg.smokeCount}
                {utilAgg.decoyCount > 0 ? ` · D: ${utilAgg.decoyCount}` : ""}
              </p>
            </Card>
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

      {/* Map performance */}
      {mapStats.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
            Map Performance
          </h2>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase text-[var(--text-tertiary)]">
                    <th className="px-5 py-3">Map</th>
                    <th className="px-3 py-3 text-center">Matches</th>
                    <th className="px-3 py-3 text-center">W%</th>
                    <th className="px-3 py-3 text-center">K/D</th>
                    <th className="px-3 py-3 text-center">ADR</th>
                    <th className="px-3 py-3 text-center">HLTV</th>
                    <th className="px-3 py-3 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {mapStats.map((m) => {
                    const isBest = m.map === bestMap;
                    const isWorst = m.map === worstMap;
                    return (
                      <tr
                        key={m.map}
                        className="border-t border-[var(--border)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-8 w-8 flex-shrink-0 rounded bg-[var(--surface-3)] bg-cover bg-center"
                              style={{
                                backgroundImage: `url(/maps/${m.map}_radar.png)`,
                                filter: "grayscale(40%) brightness(0.7)",
                              }}
                            />
                            <span className="font-medium text-[var(--text-primary)]">
                              {mapDisplayName(m.map)}
                            </span>
                          </div>
                        </td>
                        <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                          {m.matches}
                        </td>
                        <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                          {m.winRate.toFixed(0)}%
                        </td>
                        <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                          {m.kd.toFixed(2)}
                        </td>
                        <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                          {m.avgAdr.toFixed(1)}
                        </td>
                        <td
                          className={`stat-inline px-3 py-3 text-center font-semibold ${
                            m.avgHltv >= 1.2
                              ? "text-[var(--success)]"
                              : m.avgHltv >= 0.8
                                ? "text-[var(--text-primary)]"
                                : "text-[var(--error)]"
                          }`}
                        >
                          {m.avgHltv.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {isBest && <Badge variant="success">Best</Badge>}
                          {isWorst && <Badge variant="error">Worst</Badge>}
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

function SideCard({
  label,
  color,
  stats,
  kd,
  hsPct,
}: {
  label: string;
  color: string;
  stats: { kills: number; deaths: number; headshots: number };
  kd: number | null;
  hsPct: number | null;
}) {
  return (
    <Card className="border-t-2" style={{ borderTopColor: color }}>
      <p
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color }}
      >
        {label}
      </p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <SideStat label="K" value={stats.kills} />
        <SideStat label="D" value={stats.deaths} />
        <SideStat label="K/D" value={kd === null ? "—" : kd.toFixed(2)} />
        <SideStat
          label="HS%"
          value={hsPct === null ? "—" : `${hsPct.toFixed(0)}%`}
        />
      </div>
    </Card>
  );
}

function SideStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="stat-small mt-1 text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function BuyTypeCard({
  label,
  color,
  rounds,
  kd,
  adr,
  hsPct,
  winRate,
}: {
  label: string;
  color: string;
  rounds: number;
  kd: number | null;
  adr: number | null;
  hsPct: number | null;
  winRate: number | null;
}) {
  if (rounds === 0) {
    return (
      <Card
        className="border-t-2 opacity-50"
        style={{ borderTopColor: color }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>
          {label}
        </p>
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">No rounds</p>
      </Card>
    );
  }
  return (
    <Card className="border-t-2" style={{ borderTopColor: color }}>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>
          {label}
        </p>
        <p className="font-mono text-[10px] text-[var(--text-tertiary)]">
          {rounds}r
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2">
        <SideStat label="K/D" value={kd === null ? "—" : kd.toFixed(2)} />
        <SideStat label="ADR" value={adr === null ? "—" : adr.toFixed(0)} />
        <SideStat
          label="HS%"
          value={hsPct === null ? "—" : `${hsPct.toFixed(0)}%`}
        />
        <SideStat
          label="W%"
          value={winRate === null ? "—" : `${winRate.toFixed(0)}%`}
        />
      </div>
    </Card>
  );
}
