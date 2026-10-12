/**
 * Pre-match scouting (S23): turns FACEIT Data API responses for the 10
 * players of a match room into per-team map strengths and a veto
 * suggestion. Pure (no DB, no network) so the client can re-run the veto for
 * either side and `npm run test:scouting` can cover it.
 */
import type {
  FaceitMatchRoom,
  FaceitPlayer,
  FaceitPlayerGames,
  FaceitPlayerStats,
  FaceitStatBag,
} from "@/lib/faceit/types";

export type Faction = "faction1" | "faction2";

/**
 * Fallback when the room does not list its veto maps (FACEIT omits them
 * before the room is configured): the CS2 Active Duty pool.
 */
export const DEFAULT_MAP_POOL = [
  "de_ancient",
  "de_anubis",
  "de_dust2",
  "de_inferno",
  "de_mirage",
  "de_nuke",
  "de_train",
];

/** How many results the "forma" strip shows. */
export const FORM_LENGTH = 10;

/** Matches of prior a player's map winrate is pulled toward their overall winrate with. */
const SHRINK_MATCHES = 10;
/** A team that barely plays a map is weaker there than its winrate says. */
const INEXPERIENCE_PENALTY = 0.06;
const EXPERIENCED_AT = 15;

export interface PlayerMapStat {
  map: string;
  matches: number;
  wins: number;
  kd: number | null;
}

export interface ScoutPlayer {
  playerId: string;
  nickname: string;
  avatar: string | null;
  country: string | null;
  level: number | null;
  elo: number | null;
  /** False when FACEIT returned no CS2 stats (new or private player). */
  hasStats: boolean;
  lifetime: { matches: number; winRate: number | null; kd: number | null; hs: number | null };
  /** Last matches, newest first. */
  recent: {
    matches: number;
    wins: number;
    kd: number | null;
    adr: number | null;
    results: ("W" | "L")[];
    maps: Record<string, { matches: number; wins: number }>;
  };
  maps: PlayerMapStat[];
}

export interface TeamMapStrength {
  map: string;
  /** Lifetime matches on the map, summed over the roster. */
  matches: number;
  wins: number;
  /** Pooled lifetime winrate, 0–1; null when nobody has played it. */
  winRate: number | null;
  /** Matches on the map among the roster's recent games. */
  recentMatches: number;
  recentWins: number;
  /** Average K/D on the map over players who played it. */
  kd: number | null;
  /** Players with at least one lifetime match on the map. */
  playersWithMatches: number;
  /** 0–1 comparable score the veto ranks by (shrunk winrate minus inexperience). */
  strength: number;
}

export interface ScoutTeam {
  faction: Faction;
  name: string;
  avatar: string | null;
  players: ScoutPlayer[];
  maps: TeamMapStrength[];
  avgElo: number | null;
  avgLevel: number | null;
}

export interface ScoutReport {
  matchId: string;
  status: string;
  competition: string | null;
  faceitUrl: string | null;
  mapPool: string[];
  pickedMap: string | null;
  teams: [ScoutTeam, ScoutTeam];
  /** The faction the signed-in player is on, when they are in the room. */
  myFaction: Faction | null;
  fetchedAt: string;
}

// ─── Input parsing ─────────────────────────────────────────

const ROOM_ID = /(?:^|[^0-9a-f])(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-f])/i;
const BARE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Match ID from what the player pasted: a room link
 * (faceit.com/pl/cs2/room/1-…/scoreboard), the "1-…" ID itself, or a bare
 * UUID. Null when nothing looks like a match.
 */
export function parseRoomInput(input: string): string | null {
  const text = input.trim();
  const m = ROOM_ID.exec(text);
  if (m) return m[1].toLowerCase();
  if (BARE_UUID.test(text)) return text.toLowerCase();
  return null;
}

const MAP_ALIASES: Record<string, string> = {
  dust2: "de_dust2",
  "dust 2": "de_dust2",
  "dust ii": "de_dust2",
};

/** "de_mirage", "Mirage", "Dust II" → "de_mirage" / "de_dust2"; null for blanks. */
export function normalizeMapName(label: string | undefined | null): string | null {
  if (!label) return null;
  const s = label.trim().toLowerCase();
  if (!s) return null;
  if (MAP_ALIASES[s]) return MAP_ALIASES[s];
  if (/^(de|cs|ar)_[a-z0-9_]+$/.test(s)) return s;
  const slug = s.replace(/[^a-z0-9]+/g, "");
  return slug ? `de_${slug}` : null;
}

/** Map pool and picked map of the room's veto. */
export function roomMaps(room: FaceitMatchRoom): { pool: string[]; picked: string | null } {
  const entities = room.voting?.map?.entities ?? [];
  const pool = [
    ...new Set(
      entities
        .map((e) => normalizeMapName(e.class_name ?? e.game_map_id ?? e.guid ?? e.name))
        .filter((m): m is string => m !== null)
    ),
  ];
  const picked = normalizeMapName(room.voting?.map?.pick?.[0]);
  return { pool: pool.length > 0 ? pool : DEFAULT_MAP_POOL, picked };
}

// ─── Player summaries ──────────────────────────────────────

function stat(bag: FaceitStatBag | undefined, ...keys: string[]): number | null {
  if (!bag) return null;
  for (const key of keys) {
    const raw = bag[key];
    if (typeof raw !== "string") continue;
    const n = Number(raw.replace(",", ".").replace("%", ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarizePlayer(
  rosterEntry: { player_id: string; nickname: string; avatar?: string; game_skill_level?: number },
  profile: FaceitPlayer | null,
  stats: FaceitPlayerStats | null,
  games: FaceitPlayerGames | null
): ScoutPlayer {
  const life = stats?.lifetime;
  const lifetimeMatches = stat(life, "Matches") ?? 0;

  const maps: PlayerMapStat[] = [];
  for (const seg of stats?.segments ?? []) {
    if (seg.type !== "Map") continue;
    if (seg.mode && seg.mode !== "5v5") continue;
    const map = normalizeMapName(seg.label);
    if (!map) continue;
    const matches = stat(seg.stats, "Matches") ?? 0;
    if (matches <= 0) continue;
    const wins =
      stat(seg.stats, "Wins") ?? Math.round((matches * (stat(seg.stats, "Win Rate %") ?? 0)) / 100);
    const existing = maps.find((m) => m.map === map);
    if (existing) {
      existing.matches += matches;
      existing.wins += wins;
    } else {
      maps.push({ map, matches, wins, kd: stat(seg.stats, "Average K/D Ratio", "K/D Ratio") });
    }
  }
  maps.sort((a, b) => b.matches - a.matches);

  const items = games?.items ?? [];
  const results: ("W" | "L")[] = [];
  const kds: number[] = [];
  const adrs: number[] = [];
  const recentMaps: Record<string, { matches: number; wins: number }> = {};
  for (const { stats: g } of items) {
    const result = stat(g, "Result");
    if (result === null) continue;
    const won = result === 1;
    results.push(won ? "W" : "L");
    const kd = stat(g, "K/D Ratio");
    if (kd !== null) kds.push(kd);
    const adr = stat(g, "ADR");
    if (adr !== null) adrs.push(adr);
    const map = normalizeMapName(typeof g.Map === "string" ? g.Map : null);
    if (map) {
      const r = (recentMaps[map] ??= { matches: 0, wins: 0 });
      r.matches++;
      if (won) r.wins++;
    }
  }

  const cs2 = profile?.games?.cs2;
  return {
    playerId: rosterEntry.player_id,
    nickname: profile?.nickname ?? rosterEntry.nickname,
    avatar: profile?.avatar || rosterEntry.avatar || null,
    country: profile?.country ?? null,
    level: cs2?.skill_level ?? rosterEntry.game_skill_level ?? null,
    elo: cs2?.faceit_elo ?? null,
    hasStats: lifetimeMatches > 0 || results.length > 0,
    lifetime: {
      matches: lifetimeMatches,
      winRate: stat(life, "Win Rate %"),
      kd: stat(life, "Average K/D Ratio", "K/D Ratio"),
      hs: stat(life, "Average Headshots %"),
    },
    recent: {
      matches: results.length,
      wins: results.filter((r) => r === "W").length,
      kd: avg(kds),
      adr: avg(adrs),
      results: results.slice(0, FORM_LENGTH),
      maps: recentMaps,
    },
    maps,
  };
}

// ─── Team map strength ─────────────────────────────────────

/**
 * One player's score on a map: winrate shrunk toward their overall winrate
 * (recent matches count a second time, so current form weighs more), minus
 * a penalty that fades out as they reach EXPERIENCED_AT matches there.
 */
export function playerMapStrength(player: ScoutPlayer, map: string): number {
  const base =
    player.lifetime.winRate !== null
      ? player.lifetime.winRate / 100
      : player.recent.matches > 0
        ? player.recent.wins / player.recent.matches
        : 0.5;
  const life = player.maps.find((m) => m.map === map);
  const recent = player.recent.maps[map];
  const matches = (life?.matches ?? 0) + (recent?.matches ?? 0);
  const wins = (life?.wins ?? 0) + (recent?.wins ?? 0);
  const shrunk = (wins + SHRINK_MATCHES * base) / (matches + SHRINK_MATCHES);
  const experience = Math.min(1, (life?.matches ?? recent?.matches ?? 0) / EXPERIENCED_AT);
  return shrunk - INEXPERIENCE_PENALTY * (1 - experience);
}

export function teamMapStrengths(players: ScoutPlayer[], pool: string[]): TeamMapStrength[] {
  const known = players.filter((p) => p.hasStats);
  return pool.map((map) => {
    let matches = 0;
    let wins = 0;
    let recentMatches = 0;
    let recentWins = 0;
    let playersWithMatches = 0;
    const kds: number[] = [];
    for (const p of players) {
      const life = p.maps.find((m) => m.map === map);
      if (life) {
        matches += life.matches;
        wins += life.wins;
        playersWithMatches++;
        if (life.kd !== null) kds.push(life.kd);
      }
      const recent = p.recent.maps[map];
      if (recent) {
        recentMatches += recent.matches;
        recentWins += recent.wins;
      }
    }
    const strengths = known.map((p) => playerMapStrength(p, map));
    return {
      map,
      matches,
      wins,
      winRate: matches > 0 ? wins / matches : null,
      recentMatches,
      recentWins,
      kd: avg(kds),
      playersWithMatches,
      strength: avg(strengths) ?? 0.5,
    };
  });
}

export function buildTeam(
  faction: Faction,
  name: string,
  avatar: string | null,
  players: ScoutPlayer[],
  pool: string[]
): ScoutTeam {
  const elos = players.map((p) => p.elo).filter((e): e is number => e !== null);
  const levels = players.map((p) => p.level).filter((l): l is number => l !== null);
  return {
    faction,
    name,
    avatar,
    players,
    maps: teamMapStrengths(players, pool),
    avgElo: elos.length ? Math.round(avg(elos)!) : null,
    avgLevel: levels.length ? Math.round(avg(levels)! * 10) / 10 : null,
  };
}

/** The faction whose roster contains `faceitId`. */
export function factionOf(room: FaceitMatchRoom, faceitId: string | null | undefined): Faction | null {
  if (!faceitId) return null;
  for (const f of ["faction1", "faction2"] as const) {
    if (room.teams?.[f]?.roster?.some((p) => p.player_id === faceitId)) return f;
  }
  return null;
}

// ─── Opponents and veto ────────────────────────────────────

/** Opponent maps ordered strongest first, and the weakest ones (least played sorted last within ties). */
export function teamExtremes(team: ScoutTeam, n = 2): { strongest: TeamMapStrength[]; weakest: TeamMapStrength[] } {
  const sorted = [...team.maps].sort((a, b) => b.strength - a.strength || b.matches - a.matches);
  return { strongest: sorted.slice(0, n), weakest: sorted.slice(-n).reverse() };
}

export interface VetoMap {
  map: string;
  mine: number;
  theirs: number;
  /** mine − theirs: positive means the map favours us. */
  advantage: number;
}

export interface VetoStep {
  map: string;
  by: "us" | "them" | "decider";
}

export interface VetoSuggestion {
  /** Every pool map, best for us first. */
  ranking: VetoMap[];
  /** Our bans in order (worst for us first), as many as we get in a full veto. */
  ourBans: string[];
  /** A full veto where both captains ban the other side's best map. */
  simulation: VetoStep[];
  /** The map that simulation leaves. */
  predicted: string | null;
}

/**
 * FACEIT 5v5 veto: captains ban in turns until one map is left. We ban the
 * map that favours the opponents most; we expect them to ban the one that
 * favours us most. `weStart` decides who bans first.
 */
export function suggestVeto(mine: ScoutTeam, theirs: ScoutTeam, weStart = true): VetoSuggestion {
  const theirByMap = new Map(theirs.maps.map((m) => [m.map, m.strength]));
  const ranking: VetoMap[] = mine.maps
    .filter((m) => theirByMap.has(m.map))
    .map((m) => {
      const t = theirByMap.get(m.map)!;
      return { map: m.map, mine: m.strength, theirs: t, advantage: m.strength - t };
    })
    .sort((a, b) => b.advantage - a.advantage || a.map.localeCompare(b.map));

  const remaining = [...ranking];
  const simulation: VetoStep[] = [];
  let ours = weStart;
  while (remaining.length > 1) {
    const banned = ours ? remaining.pop()! : remaining.shift()!;
    simulation.push({ map: banned.map, by: ours ? "us" : "them" });
    ours = !ours;
  }
  const predicted = remaining[0]?.map ?? null;
  if (predicted) simulation.push({ map: predicted, by: "decider" });

  return {
    ranking,
    ourBans: [...ranking]
      .reverse()
      .slice(0, Math.max(0, weStart ? Math.ceil((ranking.length - 1) / 2) : Math.floor((ranking.length - 1) / 2)))
      .map((m) => m.map),
    simulation,
    predicted,
  };
}
