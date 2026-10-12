/**
 * Regression test for S23: pre-match scouting. Run: npm run test:scouting
 *
 * 1. parseRoomInput() reads room links in every shape FACEIT hands out.
 * 2. normalizeMapName() / roomMaps() turn segment labels and veto entities into de_* names.
 * 3. summarizePlayer() reads FACEIT's string stats (per-map segments, recent form).
 * 4. Team map strength favours experience over lucky small samples.
 * 5. suggestVeto() bans our worst maps, expects the opponents to ban our best,
 *    and leaves the right decider.
 *
 * No database, demo file or network needed.
 */
import {
  DEFAULT_MAP_POOL,
  buildTeam,
  factionOf,
  normalizeMapName,
  parseRoomInput,
  playerMapStrength,
  roomMaps,
  suggestVeto,
  summarizePlayer,
  teamExtremes,
  type ScoutPlayer,
} from "@/lib/scouting/analysis";
import type { FaceitMatchRoom, FaceitPlayerGames, FaceitPlayerStats } from "@/lib/faceit/types";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

const ID = "1-0b2c3d4e-5f60-4718-9a2b-3c4d5e6f7a8b";

// ─── 1. Room input ───────────────────────────────────────
check("full room link", parseRoomInput(`https://www.faceit.com/pl/cs2/room/${ID}`) === ID);
check("room link with /scoreboard and query", parseRoomInput(`https://www.faceit.com/en/cs2/room/${ID}/scoreboard?x=1`) === ID);
check("bare match id with spaces", parseRoomInput(`  ${ID}  `) === ID);
check("uppercase id is lowercased", parseRoomInput(ID.toUpperCase()) === ID);
check("bare uuid accepted", parseRoomInput(ID.slice(2)) === ID.slice(2));
check("random text rejected", parseRoomInput("https://www.faceit.com/pl/players/s1mple") === null);
check("empty rejected", parseRoomInput("   ") === null);

// ─── 2. Map names ────────────────────────────────────────
check("de_ name kept", normalizeMapName("de_mirage") === "de_mirage");
check("display name", normalizeMapName("Mirage") === "de_mirage");
check("Dust II alias", normalizeMapName("Dust II") === "de_dust2");
check("blank is null", normalizeMapName(" ") === null);

const room: FaceitMatchRoom = {
  match_id: ID,
  status: "VOTING",
  teams: {
    faction1: { name: "team_a", roster: [{ player_id: "a1", nickname: "a1", avatar: "", game_player_id: "", game_player_name: "" }] },
    faction2: { name: "team_b", roster: [{ player_id: "b1", nickname: "b1", avatar: "", game_player_id: "", game_player_name: "" }] },
  },
  voting: {
    map: {
      entities: [{ class_name: "de_mirage" }, { game_map_id: "de_nuke" }, { name: "Dust II" }],
      pick: ["de_nuke"],
    },
  },
};
const rm = roomMaps(room);
check("pool from veto entities", rm.pool.join(",") === "de_mirage,de_nuke,de_dust2");
check("picked map", rm.picked === "de_nuke");
check("default pool when room lists none", roomMaps({ ...room, voting: undefined }).pool === DEFAULT_MAP_POOL);
check("faction of viewer", factionOf(room, "b1") === "faction2");
check("viewer not in room", factionOf(room, "zz") === null && factionOf(room, null) === null);

// ─── 3. Player summary ───────────────────────────────────
const stats: FaceitPlayerStats = {
  player_id: "a1",
  lifetime: { Matches: "200", "Win Rate %": "50", "Average K/D Ratio": "1.10", "Average Headshots %": "48" },
  segments: [
    { label: "de_mirage", type: "Map", mode: "5v5", stats: { Matches: "80", Wins: "52", "Average K/D Ratio": "1.3" } },
    { label: "Nuke", type: "Map", mode: "5v5", stats: { Matches: "20", "Win Rate %": "40" } },
    { label: "de_dust2", type: "Map", mode: "Wingman", stats: { Matches: "50", Wins: "50" } },
  ],
};
const games: FaceitPlayerGames = {
  items: [
    { stats: { Result: "1", Map: "de_mirage", "K/D Ratio": "1.5", ADR: "90" } },
    { stats: { Result: "0", Map: "de_nuke", "K/D Ratio": "0.5", ADR: "60" } },
    { stats: { Result: "1", Map: "de_mirage", "K/D Ratio": "1.0", ADR: "75" } },
  ],
};
const a1 = summarizePlayer({ player_id: "a1", nickname: "a1", game_skill_level: 8 }, null, stats, games);
check("map segments parsed (wingman ignored)", a1.maps.map((m) => m.map).join(",") === "de_mirage,de_nuke");
check("wins from winrate when Wins missing", a1.maps.find((m) => m.map === "de_nuke")?.wins === 8);
check("lifetime stats", a1.lifetime.matches === 200 && a1.lifetime.winRate === 50 && a1.lifetime.kd === 1.1);
check("recent form newest first", a1.recent.results.join("") === "WLW");
check("recent K/D and ADR averaged", a1.recent.kd === 1 && a1.recent.adr === 75);
check("recent per-map counts", a1.recent.maps.de_mirage?.matches === 2 && a1.recent.maps.de_mirage.wins === 2);
check("level falls back to room roster", a1.level === 8 && a1.elo === null && a1.hasStats);
const ghost = summarizePlayer({ player_id: "g", nickname: "ghost" }, null, null, null);
check("player without stats is marked", !ghost.hasStats && ghost.recent.results.length === 0);

// ─── 4. Strength ─────────────────────────────────────────
function player(id: string, maps: Record<string, [number, number]>, winRate = 50): ScoutPlayer {
  return {
    playerId: id,
    nickname: id,
    avatar: null,
    country: null,
    level: 10,
    elo: 2000,
    hasStats: true,
    lifetime: { matches: 500, winRate, kd: 1, hs: 50 },
    recent: { matches: 0, wins: 0, kd: null, adr: null, results: [], maps: {} },
    maps: Object.entries(maps).map(([map, [matches, wins]]) => ({ map, matches, wins, kd: 1 })),
  };
}
const veteran = player("v", { de_mirage: [100, 60] });
const lucky = player("l", { de_mirage: [2, 2] });
check(
  "100 matches at 60% beats 2 matches at 100%",
  playerMapStrength(veteran, "de_mirage") > playerMapStrength(lucky, "de_mirage")
);
check(
  "unplayed map scores below the player's overall winrate",
  playerMapStrength(veteran, "de_nuke") < 0.5
);

// ─── 5. Veto ─────────────────────────────────────────────
const pool = ["de_ancient", "de_anubis", "de_dust2", "de_inferno", "de_mirage", "de_nuke", "de_train"];
// We: great Mirage, good Inferno, bad Nuke. They: great Nuke, bad Mirage.
const usPlayers = [1, 2, 3, 4, 5].map((i) =>
  player(`u${i}`, {
    de_mirage: [100, 70],
    de_inferno: [80, 48],
    de_nuke: [60, 21],
    de_ancient: [40, 20],
    de_anubis: [40, 20],
    de_dust2: [40, 20],
    de_train: [40, 20],
  })
);
const themPlayers = [1, 2, 3, 4, 5].map((i) =>
  player(`t${i}`, {
    de_nuke: [100, 70],
    de_mirage: [60, 21],
    de_inferno: [40, 20],
    de_ancient: [40, 20],
    de_anubis: [40, 20],
    de_dust2: [40, 20],
    de_train: [40, 20],
  })
);
const us = buildTeam("faction1", "us", null, usPlayers, pool);
const them = buildTeam("faction2", "them", null, themPlayers, pool);
const veto = suggestVeto(us, them, true);

check("ranking covers the whole pool", veto.ranking.length === 7);
check("Mirage is our best map", veto.ranking[0].map === "de_mirage" && veto.ranking[0].advantage > 0);
check("Nuke is our worst map", veto.ranking[6].map === "de_nuke" && veto.ranking[6].advantage < 0);
check("we ban Nuke first", veto.ourBans[0] === "de_nuke");
check("we get 3 bans of 6 when we start", veto.ourBans.length === 3);
check("opponents ban Mirage first", veto.simulation[1].map === "de_mirage" && veto.simulation[1].by === "them");
check("simulation bans 6 maps and leaves a decider", veto.simulation.length === 7 && veto.simulation[6].by === "decider");
check("opponents also take Inferno, our second-best map", veto.simulation[3].map === "de_inferno" && veto.simulation[3].by === "them");
check("decider is a neutral map", veto.predicted !== null && Math.abs(veto.ranking.find((r) => r.map === veto.predicted)!.advantage) < 0.01);
check(
  "turns alternate starting with us",
  veto.simulation.slice(0, 6).map((s) => s.by).join(",") === "us,them,us,them,us,them"
);
const theyStart = suggestVeto(us, them, false);
check("opponents starting bans Mirage first", theyStart.simulation[0].map === "de_mirage" && theyStart.simulation[0].by === "them");
check("we get 3 bans of 6 when they start", theyStart.ourBans.length === 3);
const mirror = suggestVeto(them, us, true);
check("flipping sides flips the ranking", mirror.ranking[0].map === "de_nuke");

const ext = teamExtremes(them);
check("opponent strongest map", ext.strongest[0].map === "de_nuke");
check("opponent weakest map", ext.weakest[0].map === "de_mirage");
check("team averages", us.avgElo === 2000 && us.avgLevel === 10);

console.log();
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed > 0 ? 1 : 0);
