/**
 * Loads a user's analysed matches for the progress screens (progress page,
 * public profile): resolves which player is the user, then reads the
 * scoreboard row, the stored mechanics/aim stats and finding counts of their
 * latest matches. Stored stats are read as they are (no recompute), so the
 * page stays fast; the report rebuilds stale rows when a match is opened.
 */
import type { AimStats, MechanicsStats, PrismaClient } from "@prisma/client";
import type { AimSummary, MechanicsSummary } from "@/lib/findings/report";
import { resolvePlayer, type Candidate, type ResolvedHow } from "./identity";
import type { MatchInput } from "./metrics";

/** Matches scanned to work out who the user is. */
const IDENTITY_SCAN = 200;
export const MAX_PROGRESS_MATCHES = 200;

export interface ProgressData {
  steamId: string | null;
  how: ResolvedHow;
  candidates: Candidate[];
  /** Analysed matches of the user in total (any player). */
  totalMatches: number;
  /** The player's matches in the user's library, in total. */
  playerMatches: number;
  /** Latest `limit` matches of the player, oldest → newest. */
  matches: MatchInput[];
}

export function toMechanicsSummary(m: MechanicsStats): MechanicsSummary {
  return {
    firstShots: m.firstShots,
    firstShotsMoving: m.firstShotsMoving,
    firstShotHits: m.firstShotHits,
    hits: m.hits,
    headHits: m.headHits,
    counterStrafes: m.counterStrafes,
    counterStrafeAvgMs: m.counterStrafeAvgMs,
  };
}

/** Only the numeric columns the metrics read; ids, JSON and dates stay out. */
export function toAimSummary(a: AimStats): AimSummary {
  return {
    duels: a.duels, duelsUnseen: a.duelsUnseen,
    crosshairSamples: a.crosshairSamples, crosshairAvgDeg: a.crosshairAvgDeg, crosshairMedianDeg: a.crosshairMedianDeg, crosshairBad: a.crosshairBad,
    reactionSamples: a.reactionSamples, reactionMedianMs: a.reactionMedianMs,
    ttdSamples: a.ttdSamples, ttdMedianMs: a.ttdMedianMs,
    sprays: a.sprays, sprayBullets: a.sprayBullets, sprayHits: a.sprayHits,
    flicks: a.flicks, trackings: a.trackings, preaims: a.preaims, overflicks: a.overflicks,
    peeks: a.peeks, peeksWon: a.peeksWon, dryPeeks: a.dryPeeks, dryPeeksLost: a.dryPeeksLost,
    noiseEpisodes: a.noiseEpisodes, noiseCostly: a.noiseCostly,
    jumps: a.jumps, jumpsNearEnemy: a.jumpsNearEnemy, airShots: a.airShots,
    reloads: a.reloads, badReloads: a.badReloads, reloadData: a.reloadData,
  };
}

export async function loadProgress(
  prisma: PrismaClient,
  opts: {
    userId: string;
    requested?: string | null;
    sessionSteamId?: string | null;
    faceitNickname?: string | null;
    limit: number;
  }
): Promise<ProgressData> {
  const owned = { upload: { userId: opts.userId, deletedAt: null } };
  const [totalMatches, scan] = await Promise.all([
    prisma.match.count({ where: owned }),
    prisma.match.findMany({
      where: owned,
      orderBy: { date: "desc" },
      take: IDENTITY_SCAN,
      select: { date: true, players: { select: { steamId: true, name: true } } },
    }),
  ]);
  const appearances = scan.flatMap((m) => m.players.map((p) => ({ steamId: p.steamId, name: p.name, date: m.date.toISOString() })));
  const resolved = resolvePlayer({
    requested: opts.requested,
    sessionSteamId: opts.sessionSteamId,
    faceitNickname: opts.faceitNickname,
    appearances,
    totalMatches: scan.length,
  });
  const empty: ProgressData = { ...resolved, totalMatches, playerMatches: 0, matches: [] };
  if (!resolved.steamId) return empty;
  const steamId = resolved.steamId;

  const where = { ...owned, players: { some: { steamId } } };
  const [playerMatches, rows] = await Promise.all([
    prisma.match.count({ where }),
    prisma.match.findMany({
      where,
      orderBy: { date: "desc" },
      take: Math.min(Math.max(1, opts.limit), MAX_PROGRESS_MATCHES),
      select: {
        id: true,
        date: true,
        map: true,
        scoreCT: true,
        scoreT: true,
        findingsVersion: true,
        _count: { select: { rounds: true } },
        players: { where: { steamId } },
        mechanics: { where: { steamId } },
        aim: { where: { steamId } },
      },
    }),
  ]);
  const ids = rows.map((r) => r.id);
  const counts = await prisma.finding.groupBy({
    by: ["matchId", "severity"],
    where: { matchId: { in: ids }, steamId },
    _count: { _all: true },
  });

  const matches: MatchInput[] = rows
    .filter((r) => r.players[0])
    .map((r) => {
      const p = r.players[0];
      const of = (sev: string) => counts.find((c) => c.matchId === r.id && c.severity === sev)?._count._all ?? 0;
      return {
        matchId: r.id,
        date: r.date.toISOString(),
        map: r.map,
        scoreCT: r.scoreCT,
        scoreT: r.scoreT,
        rounds: r._count.rounds,
        player: {
          name: p.name,
          team: (p.team === "T" ? "T" : "CT") as "CT" | "T",
          kills: p.kills,
          deaths: p.deaths,
          adr: p.adr,
          hltvRating: p.hltvRating,
          hsPercent: p.hsPercent,
          firstKills: p.firstKills,
          clutchWins: p.clutchWins,
        },
        mech: r.mechanics[0] ? toMechanicsSummary(r.mechanics[0]) : null,
        aim: r.aim[0] ? toAimSummary(r.aim[0]) : null,
        findings: r.findingsVersion ? { high: of("high"), medium: of("medium"), low: of("low") } : null,
      };
    })
    .reverse();

  return { ...empty, playerMatches, matches };
}
