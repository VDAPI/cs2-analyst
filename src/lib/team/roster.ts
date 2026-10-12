/**
 * Teams (S17): roles, limits, invite codes and which matches belong to a team.
 * Pure module, covered by `npm run test:team`.
 *
 * A match is the team's when at least `minTogether(roster)` of the roster's
 * SteamIDs played it on the same side (MatchPlayer.team = the side the player
 * finished on, so teammates always share it). The roster = every member's
 * in-game SteamID plus the team's extra SteamIDs (players without an account).
 */
export type TeamRoleName = "OWNER" | "COACH" | "PLAYER";
export type FinalSide = "CT" | "T";

export const MAX_TEAMS_PER_USER = 5;
export const MAX_MEMBERS = 10;
export const MAX_EXTRA_PLAYERS = 10;
export const MAX_RIVALS = 30;
export const MAX_RIVAL_PLAYERS = 10;
export const MAX_BOARDS = 200;
export const TEAM_NAME_MAX = 40;
export const TEAM_TAG_MAX = 6;
/** Team matches the dashboard reads (newest first). */
export const TEAM_MATCH_LIMIT = 60;

/** Owner manages the team; owner and coach manage rivals and every board. */
export const canManageTeam = (role: TeamRoleName) => role === "OWNER";
export const canManageContent = (role: TeamRoleName) =>
  role === "OWNER" || role === "COACH";
/** Boards and rivals: their author, or owner/coach. */
export const canEditItem = (
  role: TeamRoleName,
  userId: string,
  createdById: string | null,
) => canManageContent(role) || (createdById != null && createdById === userId);

const STEAM_ID = /^7656119\d{10}$/;
export const isSteamId64 = (v: string) => STEAM_ID.test(v.trim());

export const isInviteCode = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{12}$/.test(v);

export interface RosterMember {
  steamId: string | null;
  /** The account's linked Steam ID, used when the member set none. */
  accountSteamId: string | null;
}

/** Every SteamID that counts as "us": members (own pick, else linked Steam) + extra players. */
export function rosterSteamIds(
  members: RosterMember[],
  extra: string[],
): string[] {
  const ids = new Set<string>();
  for (const m of members) {
    const id = m.steamId ?? m.accountSteamId;
    if (id) ids.add(id);
  }
  for (const id of extra) if (id) ids.add(id);
  return [...ids];
}

/** Roster players that must play together: 3 of a full team, 2 of a duo. */
export function minTogether(rosterSize: number): number {
  return rosterSize >= 3 ? 3 : 2;
}

export interface MatchPlayerSide {
  steamId: string;
  team: FinalSide;
}

/**
 * The side (as finished) the team played on in a match, or null when not
 * enough of the roster played together. With roster players on both sides
 * (a scrim between members) the side with more of them wins.
 */
export function teamSideInMatch(
  players: MatchPlayerSide[],
  roster: string[],
  min = minTogether(roster.length),
): FinalSide | null {
  if (roster.length < 2) return null;
  const set = new Set(roster);
  const count = { CT: 0, T: 0 };
  for (const p of players) if (set.has(p.steamId)) count[p.team]++;
  const side: FinalSide = count.CT >= count.T ? "CT" : "T";
  return count[side] >= min ? side : null;
}

/** Rival players that must play together for a match to be the rival's. */
export const ANTISTRAT_MIN_TOGETHER = 3;

/** The side (as finished) a rival played on, or null (same rule, fixed minimum). */
export function rivalSideInMatch(
  players: MatchPlayerSide[],
  rival: string[],
): FinalSide | null {
  return teamSideInMatch(
    players,
    rival,
    Math.min(ANTISTRAT_MIN_TOGETHER, Math.max(1, rival.length)),
  );
}

/** Who becomes owner when the owner leaves: a coach first, then the longest member. */
export function nextOwner<
  T extends { role: TeamRoleName; joinedAt: Date | string; userId: string },
>(members: T[], leaving: string): T | null {
  const rest = members
    .filter((m) => m.userId !== leaving)
    .sort((a, b) => {
      const rank = (r: TeamRoleName) =>
        r === "OWNER" ? 0 : r === "COACH" ? 1 : 2;
      return (
        rank(a.role) - rank(b.role) ||
        new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
      );
    });
  return rest[0] ?? null;
}

/** Trimmed, de-duplicated, valid SteamID64s from free text (one per line, comma or space). */
export function parseSteamIdList(text: string): {
  ids: string[];
  invalid: string[];
} {
  const ids: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const v = raw.trim();
    if (!v) continue;
    if (isSteamId64(v)) {
      if (!ids.includes(v)) ids.push(v);
    } else invalid.push(v);
  }
  return { ids, invalid };
}
