/**
 * Database side of the Discord bot (S26): the `DiscordDeps` the command
 * handler runs on. Reads stored data only (no analysis is recomputed for a
 * command), so replies stay inside Discord's 3-second window.
 */
import type { PrismaClient } from "@prisma/client";
import { resolvePlayer } from "@/lib/progress/identity";
import { buildReport, playerMetrics, type AimSummary } from "@/lib/findings/report";
import type { DiscordDeps } from "./handler";
import { summarizeStats, type LastMatchSummary, type MatchResultCode, type StatsMatch } from "./format";
import { appBaseUrl } from "./rest";
import { hitRateLimit } from "@/lib/security/rate-limit";

/** Matches scanned to recognise which player in the demos is the account owner. */
const IDENTITY_SCAN = 40;

function resultOf(team: string, scoreCT: number, scoreT: number): MatchResultCode {
  const own = team === "CT" ? scoreCT : scoreT;
  const enemy = team === "CT" ? scoreT : scoreCT;
  return own > enemy ? "W" : own < enemy ? "L" : "D";
}

/** The account owner's SteamID in their own demos (linked Steam, FACEIT nickname or the most frequent player). */
export async function ownSteamId(prisma: PrismaClient, userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { steamId: true, faceitNickname: true } });
  if (!user) return null;
  const scan = await prisma.match.findMany({
    where: { upload: { kind: "PLAYER", userId, deletedAt: null } },
    orderBy: { date: "desc" },
    take: IDENTITY_SCAN,
    select: { date: true, players: { select: { steamId: true, name: true } } },
  });
  return resolvePlayer({
    sessionSteamId: user.steamId,
    faceitNickname: user.faceitNickname,
    appearances: scan.flatMap((m) => m.players.map((p) => ({ steamId: p.steamId, name: p.name, date: m.date.toISOString() }))),
    totalMatches: scan.length,
  }).steamId;
}

export function prismaDiscordDeps(prisma: PrismaClient): DiscordDeps {
  return {
    appUrl: appBaseUrl(),

    async findLinked(discordId) {
      const user = await prisma.user.findUnique({ where: { discordId }, select: { id: true, locale: true } });
      return user ? { userId: user.id, locale: user.locale } : null;
    },

    async linkByCode(codeHash, discordId, username, now) {
      if (!(await hitRateLimit("discordLink", discordId)).allowed) return null;
      return prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { discordLinkCode: codeHash },
          select: { id: true, name: true, email: true, discordLinkExpires: true },
        });
        if (!user || !user.discordLinkExpires || user.discordLinkExpires < now) return null;
        // One Discord account belongs to one app account: linking moves it.
        await tx.user.updateMany({ where: { discordId, NOT: { id: user.id } }, data: { discordId: null, discordUsername: null } });
        await tx.user.update({
          where: { id: user.id },
          data: { discordId, discordUsername: username.slice(0, 100), discordLinkCode: null, discordLinkExpires: null },
        });
        return { name: user.name ?? user.email?.split("@")[0] ?? "CS2 Analyst" };
      });
    },

    async unlink(discordId) {
      const res = await prisma.user.updateMany({ where: { discordId }, data: { discordId: null, discordUsername: null } });
      return res.count > 0;
    },

    async loadStats(userId, n) {
      const steamId = await ownSteamId(prisma, userId);
      if (!steamId) return null;
      const rows = await prisma.match.findMany({
        where: { upload: { kind: "PLAYER", userId, deletedAt: null }, players: { some: { steamId } } },
        orderBy: { date: "desc" },
        take: n,
        select: { map: true, date: true, scoreCT: true, scoreT: true, players: { where: { steamId } } },
      });
      const matches: StatsMatch[] = rows
        .filter((r) => r.players[0])
        .map((r) => {
          const p = r.players[0];
          return {
            map: r.map,
            date: r.date.toISOString(),
            result: resultOf(p.team, r.scoreCT, r.scoreT),
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            adr: p.adr,
            hsPercent: p.hsPercent,
            hltvRating: p.hltvRating,
          };
        });
      const name = rows[0]?.players[0]?.name ?? "";
      return summarizeStats(name, matches);
    },

    async loadLastMatch(userId) {
      const steamId = await ownSteamId(prisma, userId);
      if (!steamId) return null;
      const m = await prisma.match.findFirst({
        where: { upload: { kind: "PLAYER", userId, deletedAt: null }, players: { some: { steamId } } },
        orderBy: { date: "desc" },
        select: {
          id: true,
          map: true,
          date: true,
          scoreCT: true,
          scoreT: true,
          players: { where: { steamId } },
          mechanics: { where: { steamId } },
          aim: { where: { steamId } },
          tactics: { where: { steamId } },
          utility: { where: { steamId } },
          findings: { where: { steamId }, select: { type: true, severity: true, costly: true, roundNumber: true, tick: true } },
        },
      });
      const p = m?.players[0];
      if (!m || !p) return null;
      const metrics = playerMetrics(
        m.mechanics[0] ?? null,
        (m.aim[0] ?? null) as AimSummary | null,
        m.tactics[0] ?? null,
        m.utility[0] ?? null
      );
      const report = buildReport(m.findings, metrics);
      const own = p.team === "CT" ? m.scoreCT : m.scoreT;
      const enemy = p.team === "CT" ? m.scoreT : m.scoreCT;
      const summary: LastMatchSummary = {
        matchId: m.id,
        map: m.map,
        date: m.date.toISOString(),
        name: p.name,
        ownScore: own,
        enemyScore: enemy,
        result: resultOf(p.team, m.scoreCT, m.scoreT),
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        adr: p.adr,
        hsPercent: p.hsPercent,
        hltvRating: p.hltvRating,
        topIssues: report.top.map((i) => i.type),
      };
      return summary;
    },
  };
}
