/**
 * Team data from the DB (S17): membership checks, the roster, the team's
 * matches and a rival's matches across every member's library, the dashboard
 * and anti-strat inputs, and replay access for teammates.
 *
 * A teammate's match is readable by the team (dashboard, anti-strat, 2D
 * replay) only when it is a team match (enough of the roster on one side) or
 * a match of one of the team's rivals; the rest of a member's library stays
 * private.
 */
import type { Prisma, PrismaClient, TeamRole } from "@prisma/client";
import { loadTacticsInput } from "@/lib/analysis/persist-tactics";
import { getPlaceLookup } from "@/lib/analysis/persist-utility";
import {
  ANTISTRAT_VERSION,
  analyzeRival,
  type AntiStratMapContext,
  type AntiStratMatch,
  type AntiStratReport,
  type Point3,
} from "./antistrat";
import {
  TEAM_MATCH_LIMIT,
  rivalSideInMatch,
  rosterSteamIds,
  teamSideInMatch,
  type FinalSide,
} from "./roster";
import type { TeamMatchInput } from "./stats";
import { newInviteCode } from "./invite";
import { playerCandidates, resolvePlayer } from "@/lib/progress/identity";

/** Rival matches the anti-strat reads (newest first). */
export const RIVAL_MATCH_LIMIT = 15;
/** Candidate matches scanned per lookup before the roster rule filters them. */
const SCAN_LIMIT = 400;

export interface TeamContext {
  team: {
    id: string;
    name: string;
    tag: string | null;
    inviteCode: string | null;
    extraSteamIds: string[];
    createdAt: Date;
  };
  role: TeamRole;
  memberId: string;
  members: Array<{
    id: string;
    userId: string;
    role: TeamRole;
    steamId: string | null;
    joinedAt: Date;
    user: { name: string | null; email: string | null; image: string | null; steamId: string | null };
  }>;
  /** SteamIDs that count as the team in demos. */
  roster: string[];
  /** Users whose libraries the team reads. */
  memberUserIds: string[];
}

/**
 * Runs `fn` in a transaction holding a per-team advisory lock (the
 * `withUploadSlots` pattern), so a count-then-create against a team cap
 * (members, rivals, boards) can't be raced past by parallel requests. Keep
 * slow work outside `fn`.
 */
export async function withTeamLock<T>(
  prisma: PrismaClient,
  teamId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team:${teamId}`}))`;
      return fn(tx);
    },
    { timeout: 15_000 }
  );
}

/** The team as seen by one of its members, or null when the user is not in it. */
export async function getTeamContext(prisma: PrismaClient, userId: string, teamId: string): Promise<TeamContext | null> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      tag: true,
      inviteCode: true,
      extraSteamIds: true,
      createdAt: true,
      members: {
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          userId: true,
          role: true,
          steamId: true,
          joinedAt: true,
          user: { select: { name: true, email: true, image: true, steamId: true } },
        },
      },
    },
  });
  if (!team) return null;
  const me = team.members.find((m) => m.userId === userId)!;
  const { members, ...rest } = team;
  return {
    team: rest,
    role: me.role,
    memberId: me.id,
    members,
    roster: rosterSteamIds(
      members.map((m) => ({ steamId: m.steamId, accountSteamId: m.user.steamId })),
      team.extraSteamIds
    ),
    memberUserIds: members.map((m) => m.userId),
  };
}

/** Teams of a user, newest membership first. */
export async function listUserTeams(prisma: PrismaClient, userId: string) {
  return prisma.teamMember.findMany({
    where: { userId },
    orderBy: { joinedAt: "desc" },
    select: {
      role: true,
      team: { select: { id: true, name: true, tag: true, _count: { select: { members: true, rivals: true, boards: true } } } },
    },
  });
}

/** Older teams have no invite code yet: give them one. */
export async function ensureInviteCode(prisma: PrismaClient, teamId: string, current: string | null): Promise<string> {
  if (current) return current;
  const code = newInviteCode();
  await prisma.team.update({ where: { id: teamId }, data: { inviteCode: code } });
  return code;
}

interface MatchHead {
  id: string;
  map: string;
  date: Date;
  totalTicks: number;
  scoreCT: number;
  scoreT: number;
  players: Array<{ steamId: string; team: FinalSide }>;
}

const libraryWhere = (userIds: string[]): Prisma.MatchWhereInput => ({
  upload: { userId: { in: userIds }, deletedAt: null, pro: false, status: "COMPLETED" },
});

/** The same demo uploaded by two members is one match. */
const demoKey = (m: MatchHead) =>
  `${m.map}|${m.totalTicks}|${m.scoreCT}-${m.scoreT}|${m.players.map((p) => p.steamId).sort().join(",")}`;

async function candidateMatches(prisma: PrismaClient, userIds: string[], steamIds: string[]): Promise<MatchHead[]> {
  if (userIds.length === 0 || steamIds.length === 0) return [];
  const rows = await prisma.match.findMany({
    where: { ...libraryWhere(userIds), players: { some: { steamId: { in: steamIds } } } },
    orderBy: { date: "desc" },
    take: SCAN_LIMIT,
    select: {
      id: true,
      map: true,
      date: true,
      totalTicks: true,
      scoreCT: true,
      scoreT: true,
      players: { select: { steamId: true, team: true } },
    },
  });
  const seen = new Set<string>();
  return rows.filter((m) => {
    const key = demoKey(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The team's matches (newest first) with the side the team finished on. */
export async function findTeamMatches(
  prisma: PrismaClient,
  ctx: Pick<TeamContext, "roster" | "memberUserIds">,
  limit = TEAM_MATCH_LIMIT
): Promise<Array<MatchHead & { teamSide: FinalSide }>> {
  const out: Array<MatchHead & { teamSide: FinalSide }> = [];
  for (const m of await candidateMatches(prisma, ctx.memberUserIds, ctx.roster)) {
    const teamSide = teamSideInMatch(m.players, ctx.roster);
    if (teamSide) out.push({ ...m, teamSide });
    if (out.length >= limit) break;
  }
  return out;
}

/** A rival's matches in the team's libraries (newest first) with the rival's final side. */
export async function findRivalMatches(
  prisma: PrismaClient,
  memberUserIds: string[],
  rival: string[],
  limit = RIVAL_MATCH_LIMIT
): Promise<Array<MatchHead & { rivalSide: FinalSide }>> {
  const out: Array<MatchHead & { rivalSide: FinalSide }> = [];
  for (const m of await candidateMatches(prisma, memberUserIds, rival)) {
    const rivalSide = rivalSideInMatch(m.players, rival);
    if (rivalSide) out.push({ ...m, rivalSide });
    if (out.length >= limit) break;
  }
  return out;
}

/** Dashboard inputs for the given team matches. */
export async function loadTeamMatchInputs(
  prisma: PrismaClient,
  matches: Array<{ id: string; teamSide: FinalSide }>
): Promise<TeamMatchInput[]> {
  if (matches.length === 0) return [];
  const sideOf = new Map(matches.map((m) => [m.id, m.teamSide]));
  const rows = await prisma.match.findMany({
    where: { id: { in: matches.map((m) => m.id) } },
    select: {
      id: true,
      map: true,
      date: true,
      scoreCT: true,
      scoreT: true,
      rounds: {
        orderBy: { number: "asc" },
        select: { number: true, winner: true, ctScore: true, tScore: true, bombs: { where: { type: "PLANTED" }, select: { id: true }, take: 1 } },
      },
      players: {
        select: {
          steamId: true,
          name: true,
          team: true,
          kills: true,
          deaths: true,
          assists: true,
          adr: true,
          hltvRating: true,
          firstKills: true,
          firstDeaths: true,
          clutchWins: true,
          clutchAttempts: true,
          utilityDamage: true,
          flashAssists: true,
        },
      },
      tactics: { select: { steamId: true, deaths: true, tradedDeaths: true, tradeChances: true, tradesMade: true } },
      findings: { select: { steamId: true, type: true, category: true, severity: true } },
    },
  });
  return rows.map((m) => ({
    matchId: m.id,
    map: m.map,
    date: m.date.toISOString(),
    teamSide: sideOf.get(m.id)!,
    scoreCT: m.scoreCT,
    scoreT: m.scoreT,
    rounds: m.rounds.map((r) => ({ number: r.number, winner: r.winner, ctScore: r.ctScore, tScore: r.tScore, planted: r.bombs.length > 0 })),
    players: m.players,
    trades: m.tactics,
    findings: m.findings,
  }));
}

/** Mean plant spot of each bombsite on a map, from every analysed plant. */
export async function bombsiteCentres(prisma: PrismaClient, map: string): Promise<Partial<Record<"A" | "B", Point3>>> {
  const rows = await prisma.$queryRaw<Array<{ site: string; x: number; y: number; z: number }>>`
    SELECT b."site" AS site, AVG(b."posX")::float8 AS x, AVG(b."posY")::float8 AS y, AVG(b."posZ")::float8 AS z
    FROM "BombEvent" b
    JOIN "Round" r ON r."id" = b."roundId"
    JOIN "Match" m ON m."id" = r."matchId"
    WHERE m."map" = ${map} AND b."type" = 'PLANTED' AND b."site" IN ('A', 'B')
    GROUP BY b."site"`;
  const out: Partial<Record<"A" | "B", Point3>> = {};
  for (const r of rows) if (r.site === "A" || r.site === "B") out[r.site] = { x: r.x, y: r.y, z: r.z };
  return out;
}

async function loadAntiStratMatch(
  prisma: PrismaClient,
  head: MatchHead & { rivalSide: FinalSide }
): Promise<AntiStratMatch | null> {
  const [input, extra] = await Promise.all([
    loadTacticsInput(prisma, head.id),
    prisma.match.findUnique({
      where: { id: head.id },
      select: {
        tickRate: true,
        rounds: {
          select: {
            number: true,
            kills: { select: { tick: true, weapon: true, attackerSteamId: true, victimSteamId: true } },
            grenades: {
              select: { tick: true, throwerSteamId: true, grenadeType: true, landPosX: true, landPosY: true, landPosZ: true },
            },
          },
        },
        players: {
          select: { steamId: true, name: true, team: true, kills: true, deaths: true, adr: true, hltvRating: true, firstKills: true, firstDeaths: true },
        },
      },
    }),
  ]);
  if (!input || !extra) return null;
  const weaponOf = new Map<string, string>();
  for (const r of extra.rounds) for (const k of r.kills) weaponOf.set(`${r.number}|${k.tick}|${k.attackerSteamId}|${k.victimSteamId}`, k.weapon);
  return {
    matchId: head.id,
    map: head.map,
    date: head.date.toISOString(),
    tickRate: input.tickRate,
    scoreCT: head.scoreCT,
    scoreT: head.scoreT,
    rivalSide: head.rivalSide,
    rounds: input.rounds,
    kills: input.kills.map((k) => ({ ...k, weapon: weaponOf.get(`${k.roundNumber}|${k.tick}|${k.attackerSteamId}|${k.victimSteamId}`) })),
    bombs: input.bombs,
    economy: input.economy,
    grenades: extra.rounds.flatMap((r) =>
      r.grenades.map((g) => ({
        roundNumber: r.number,
        tick: g.tick,
        throwerSteamId: g.throwerSteamId,
        type: g.grenadeType,
        landX: g.landPosX,
        landY: g.landPosY,
        landZ: g.landPosZ,
      }))
    ),
    players: extra.players,
  };
}

/**
 * The rival's anti-strat report, cached on the row: rebuilt when the
 * analysis version or the set of matches changes (a new demo of them).
 */
export async function getRivalReport(
  prisma: PrismaClient,
  memberUserIds: string[],
  rival: { id: string; steamIds: string[]; reportKey: string | null; report: Prisma.JsonValue | null },
  opts: { force?: boolean } = {}
): Promise<{ report: AntiStratReport; matches: Array<MatchHead & { rivalSide: FinalSide }> }> {
  const matches = await findRivalMatches(prisma, memberUserIds, rival.steamIds);
  const key = `v${ANTISTRAT_VERSION}:${[...rival.steamIds].sort().join(",")}:${matches.map((m) => m.id).join(",")}`;
  if (!opts.force && rival.reportKey === key && rival.report) {
    return { report: rival.report as unknown as AntiStratReport, matches };
  }
  const loaded = (await Promise.all(matches.map((m) => loadAntiStratMatch(prisma, m)))).filter(
    (m): m is AntiStratMatch => m != null
  );
  const maps: Record<string, AntiStratMapContext> = {};
  for (const map of new Set(loaded.map((m) => m.map))) {
    const [sites, place] = await Promise.all([bombsiteCentres(prisma, map), getPlaceLookup(prisma, map)]);
    maps[map] = { sites, place };
  }
  const report = analyzeRival({ rival: rival.steamIds, matches: loaded, maps });
  await prisma.teamRival.update({
    where: { id: rival.id },
    data: { reportKey: key, report: report as unknown as Prisma.InputJsonValue },
  });
  return { report, matches };
}

/**
 * May `viewerId` read a teammate's match (2D replay, its data routes)? Only
 * team matches and rival matches of a team both are in, never the rest of the
 * uploader's library.
 */
export async function teamCanSeeMatch(prisma: PrismaClient, viewerId: string, matchId: string): Promise<boolean> {
  const upload = await prisma.demoUpload.findFirst({
    where: { matchId, deletedAt: null, pro: false },
    select: { userId: true, match: { select: { players: { select: { steamId: true, team: true } } } } },
  });
  if (!upload?.match || upload.userId === viewerId) return false;
  const teams = await prisma.team.findMany({
    where: { AND: [{ members: { some: { userId: viewerId } } }, { members: { some: { userId: upload.userId } } }] },
    select: {
      extraSteamIds: true,
      members: { select: { steamId: true, user: { select: { steamId: true } } } },
      rivals: { select: { steamIds: true } },
    },
  });
  const players = upload.match.players;
  return teams.some((t) => {
    const roster = rosterSteamIds(
      t.members.map((m) => ({ steamId: m.steamId, accountSteamId: m.user.steamId })),
      t.extraSteamIds
    );
    return teamSideInMatch(players, roster) != null || t.rivals.some((r) => rivalSideInMatch(players, r.steamIds) != null);
  });
}

/**
 * The SteamID a new member most likely plays under, when the account has no
 * linked Steam: the progress screen's rule (FACEIT nickname, then the player
 * in clearly most of their demos). Null when unsure; they pick it in settings.
 */
export async function guessMemberSteamId(prisma: PrismaClient, userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { steamId: true, faceitNickname: true } });
  if (!user || user.steamId) return null;
  const scan = await prisma.match.findMany({
    where: { upload: { userId, deletedAt: null } },
    orderBy: { date: "desc" },
    take: 100,
    select: { date: true, players: { select: { steamId: true, name: true } } },
  });
  const appearances = scan.flatMap((m) => m.players.map((p) => ({ steamId: p.steamId, name: p.name, date: m.date.toISOString() })));
  return resolvePlayer({ faceitNickname: user.faceitNickname, appearances, totalMatches: scan.length }).steamId;
}

/** Players of the member's own matches, most frequent first (the "that's me" picker). */
export async function memberCandidates(prisma: PrismaClient, userId: string) {
  const scan = await prisma.match.findMany({
    where: { upload: { userId, deletedAt: null, pro: false } },
    orderBy: { date: "desc" },
    take: 100,
    select: { date: true, players: { select: { steamId: true, name: true } } },
  });
  return playerCandidates(scan.flatMap((m) => m.players.map((p) => ({ steamId: p.steamId, name: p.name, date: m.date.toISOString() })))).slice(0, 8);
}
