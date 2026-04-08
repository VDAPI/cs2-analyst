/**
 * Demo Parser Service
 *
 * Wraps @laihoe/demoparser2 (Rust-based) to extract structured data
 * from CS2 .dem files. Runs server-side only (Node.js bindings).
 *
 * Usage:
 *   const data = await parseDemoFile("/path/to/demo.dem");
 */

import type {
  ParsedDemo,
  ParsedKill,
  ParsedPlayer,
  ParsedRound,
  ParsedGrenade,
  ParsedBombEvent,
  PlayerTickData,
} from "@/types";

// Dynamic import — demoparser2 uses native Node bindings
let demoparser: typeof import("@laihoe/demoparser2") | null = null;

async function getParser() {
  if (!demoparser) {
    demoparser = await import("@laihoe/demoparser2");
  }
  return demoparser;
}

/**
 * Parse a full demo file and return structured data.
 */
export async function parseDemoFile(filePath: string): Promise<ParsedDemo> {
  const parser = await getParser();

  // 1. Parse kill events
  const killEvents = parser.parseEvent(filePath, "player_death", [
    "X",
    "Y",
    "Z",
    "last_place_name",
  ]);

  // 2. Parse round events
  const roundStarts = parser.parseEvent(filePath, "round_start");
  const roundEnds = parser.parseEvent(filePath, "round_end");

  // 3. Parse grenade events
  const grenadeThrown = parser.parseEvent(filePath, "grenade_thrown");
  const grenadeDetonated = parser.parseEvent(
    filePath,
    "smokegrenade_detonate"
  );
  const flashDetonated = parser.parseEvent(
    filePath,
    "flashbang_detonate"
  );
  const heDetonated = parser.parseEvent(filePath, "hegrenade_detonate");
  const molotovDetonate = parser.parseEvent(filePath, "inferno_startburn");

  // 4. Parse bomb events
  const bombPlanted = parser.parseEvent(filePath, "bomb_planted");
  const bombDefused = parser.parseEvent(filePath, "bomb_defused");
  const bombExploded = parser.parseEvent(filePath, "bomb_exploded");

  // 5. Parse tick data (sampled — every 32 ticks for performance)
  const tickFields = [
    "X",
    "Y",
    "Z",
    "pitch",
    "yaw",
    "health",
    "armor_value",
    "active_weapon_name",
    "is_alive",
    "current_equip_value",
    "has_defuser",
    "team_name",
  ];
  const tickData = parser.parseTicks(filePath, tickFields);

  // 6. Parse player info (scoreboard)
  const gameEndEvent = parser.parseEvent(filePath, "round_end");

  // TODO: Transform raw parser output into our typed structures
  // This is a skeleton — actual transformation logic depends on
  // the exact shape of demoparser2 output (JSON arrays)

  return {
    header: {
      map: "de_unknown", // extracted from header
      duration: 0,
      tickRate: 64,
      totalTicks: 0,
      date: new Date(),
      server: "",
      scoreCT: 0,
      scoreT: 0,
    },
    rounds: [],
    players: [],
    kills: [],
    grenades: [],
    bombEvents: [],
    ticks: [],
  };
}

/**
 * Quick parse — only extract scoreboard data (fast, no tick data).
 */
export async function parseScoreboard(
  filePath: string
): Promise<ParsedPlayer[]> {
  const parser = await getParser();
  // Parse only the essential events for player stats
  const kills = parser.parseEvent(filePath, "player_death");
  const damages = parser.parseEvent(filePath, "player_hurt");

  // TODO: Aggregate into player stats
  return [];
}

/**
 * Parse only tick positions for heatmap generation.
 */
export async function parsePositions(
  filePath: string
): Promise<Array<{ steamId: string; team: string; x: number; y: number; tick: number }>> {
  const parser = await getParser();
  const ticks = parser.parseTicks(filePath, ["X", "Y", "team_name"]);

  // TODO: Transform tick data into position array
  return [];
}
