/**
 * Clips page data (S25): highlights (won clutches, multi-kills) of the
 * player's latest matches, or of every player of one match, plus their
 * most costly mistakes. Reads stored rounds, kills and findings only.
 */
import type { PrismaClient } from "@prisma/client";
import { createSideResolver, type Side } from "@/lib/utils/sideSplit";
import { detectHighlights, type Highlight } from "./highlights";

/** Matches scanned for the player's highlights. */
export const CLIPS_MATCH_SCAN = 30;
/** Cards shown per tab. */
export const CLIPS_SHOWN = 24;

export interface ClipMatch {
  id: string;
  map: string;
  date: string;
}

export interface HighlightRow extends Highlight {
  match: ClipMatch;
  playerName: string;
}

export interface MistakeRow {
  id: string;
  type: string;
  severity: "high" | "medium" | "low";
  steamId: string;
  targetSteamId: string | null;
  round: number;
  tick: number;
  roundTime: number;
  match: ClipMatch;
}

export async function loadHighlights(
  prisma: PrismaClient,
  opts: { userId: string; steamId: string | null; matchId?: string | null }
): Promise<HighlightRow[]> {
  const owned = { upload: { userId: opts.userId, deletedAt: null } };
  if (!opts.matchId && !opts.steamId) return [];
  const matches = await prisma.match.findMany({
    where: opts.matchId ? { ...owned, id: opts.matchId } : { ...owned, players: { some: { steamId: opts.steamId! } } },
    orderBy: { date: "desc" },
    take: opts.matchId ? 1 : CLIPS_MATCH_SCAN,
    select: {
      id: true,
      map: true,
      date: true,
      tickRate: true,
      players: { select: { steamId: true, name: true, team: true } },
      rounds: {
        orderBy: { number: "asc" },
        select: {
          number: true,
          startTick: true,
          endTick: true,
          winner: true,
          ctScore: true,
          tScore: true,
          kills: { select: { tick: true, attackerSteamId: true, victimSteamId: true, weapon: true, headshot: true } },
        },
      },
    },
  });

  const rows: HighlightRow[] = [];
  for (const m of matches) {
    const finalTeamBySteamId = new Map<string, Side>(m.players.map((p) => [p.steamId, p.team === "T" ? "T" : "CT"]));
    const nameOf = new Map(m.players.map((p) => [p.steamId, p.name]));
    const highlights = detectHighlights({
      rounds: m.rounds.map((r) => ({ ...r, winner: r.winner === "T" ? "T" : "CT" })),
      finalTeamBySteamId,
      sideAt: createSideResolver(m.rounds),
      tickRate: m.tickRate || 64,
    });
    const match = { id: m.id, map: m.map, date: m.date.toISOString() };
    for (const h of highlights) {
      if (!opts.matchId && h.steamId !== opts.steamId) continue;
      rows.push({ ...h, match, playerName: nameOf.get(h.steamId) ?? h.steamId });
    }
  }
  // Best first; ties go to the newer match.
  return rows.sort((a, b) => b.score - a.score || b.match.date.localeCompare(a.match.date) || a.round - b.round).slice(0, CLIPS_SHOWN);
}

/** The player's high-severity mistakes in their latest matches, costliest first. */
export async function loadMistakes(
  prisma: PrismaClient,
  opts: { userId: string; steamId: string | null; matchId?: string | null }
): Promise<MistakeRow[]> {
  if (!opts.steamId) return [];
  const findings = await prisma.finding.findMany({
    where: {
      steamId: opts.steamId,
      severity: "high",
      match: { upload: { userId: opts.userId, deletedAt: null }, ...(opts.matchId ? { id: opts.matchId } : {}) },
    },
    orderBy: [{ match: { date: "desc" } }, { tick: "asc" }],
    take: 200,
    select: {
      id: true,
      type: true,
      severity: true,
      steamId: true,
      targetSteamId: true,
      roundNumber: true,
      tick: true,
      roundTime: true,
      wpBefore: true,
      wpAfter: true,
      match: { select: { id: true, map: true, date: true } },
    },
  });
  const cost = (f: (typeof findings)[number]) => (f.wpBefore != null && f.wpAfter != null ? f.wpBefore - f.wpAfter : 0);
  return findings
    .map((f) => ({ f, c: cost(f) }))
    .sort((a, b) => b.c - a.c || b.f.match.date.getTime() - a.f.match.date.getTime())
    .slice(0, CLIPS_SHOWN)
    .map(({ f }) => ({
      id: f.id,
      type: f.type,
      severity: "high" as const,
      steamId: f.steamId,
      targetSteamId: f.targetSteamId,
      round: f.roundNumber,
      tick: f.tick,
      roundTime: f.roundTime,
      match: { id: f.match.id, map: f.match.map, date: f.match.date.toISOString() },
    }));
}
