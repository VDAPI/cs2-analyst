/**
 * One pass over the demo for every game event the pipeline reads (S28).
 *
 * Each demoparser2 `parseEvent` call is a full pass over the .dem (~0.2 s for
 * a 10-round demo, whatever the event), and one analysis asks for ~20 events.
 * `parseEvents` reads them all in one pass, with the union of the extra
 * player props on every row. `prefetchingParser` serves `parseEvent` from
 * such passes and strips the extra props the caller didn't ask for, so every
 * caller gets exactly the rows a separate `parseEvent` would have returned
 * (checked on a real demo when this was written; `npm run bench:parse`).
 *
 * Events or extras not listed here go straight to the parser. If a pass
 * throws (a prop this demo can't read), its events fall back to separate
 * calls too, so error handling at the call sites is unchanged.
 */
import type { DemoParser } from "./load-parser";

interface PrefetchPass {
  events: string[];
  extras: string[];
}

const POSITION = ["X", "Y", "Z"];

/**
 * What the pipeline asks for (demo-parser.ts, replay-data.ts). `inventory`
 * is costly on every event (~1 s on 10 rounds), so player_death gets it in a
 * pass of its own.
 */
export const PREFETCH_PASSES: PrefetchPass[] = [
  {
    events: [
      "begin_new_match",
      "round_start",
      "round_end",
      "round_freeze_end",
      "cs_win_panel_match",
      "player_death",
      "player_hurt",
      "player_blind",
      "bomb_planted",
      "bomb_defused",
      "bomb_exploded",
      "smokegrenade_detonate",
      "flashbang_detonate",
      "hegrenade_detonate",
      "inferno_startburn",
      "inferno_expire",
      "decoy_detonate",
      "weapon_fire",
      "weapon_reload",
    ],
    extras: [
      ...POSITION,
      "pitch",
      "yaw",
      "velocity_X",
      "velocity_Y",
      "velocity_Z",
      "last_place_name",
      "active_weapon_name",
      "active_weapon_ammo",
    ],
  },
  { events: ["player_death"], extras: ["inventory"] },
];

/** Event rows prefix player props with the player's role in the event. */
const ROLE_PREFIXES = ["user_", "attacker_", "assister_"];

type Row = Record<string, unknown>;

/** Copy of `row` without the props a pass added beyond `wanted`. */
export function stripExtras(row: Row, passExtras: string[], wanted: Set<string>): Row {
  const out: Row = {};
  for (const key of Object.keys(row)) {
    if (isUnwantedExtra(key, passExtras, wanted)) continue;
    out[key] = row[key];
  }
  return out;
}

function isUnwantedExtra(key: string, passExtras: string[], wanted: Set<string>): boolean {
  for (const prefix of ROLE_PREFIXES) {
    if (!key.startsWith(prefix)) continue;
    const prop = key.slice(prefix.length);
    return passExtras.includes(prop) && !wanted.has(prop);
  }
  return false;
}

/**
 * A parser for one demo file whose `parseEvent` is served from the passes
 * above (each run on first use). Everything else is passed through.
 */
export function prefetchingParser(base: DemoParser, filePath: string): DemoParser {
  const results = new Map<PrefetchPass, Map<string, Row[]> | "failed">();

  const runPass = (pass: PrefetchPass): Map<string, Row[]> | "failed" => {
    const cached = results.get(pass);
    if (cached) return cached;
    let byEvent: Map<string, Row[]> | "failed";
    try {
      const rows = (base.parseEvents(filePath, pass.events, pass.extras) ?? []) as Row[];
      byEvent = new Map(pass.events.map((e) => [e, [] as Row[]]));
      for (const row of rows) byEvent.get(String(row.event_name))?.push(row);
    } catch (err) {
      console.warn(`[event-prefetch] one-pass read failed (${pass.events.length} events), reading them one by one:`, err);
      byEvent = "failed";
    }
    results.set(pass, byEvent);
    return byEvent;
  };

  return {
    parseHeader: (p) => base.parseHeader(p),
    parsePlayerInfo: (p) => base.parsePlayerInfo(p),
    parseEvents: (p, names, extra) => base.parseEvents(p, names, extra),
    parseTicks: (...args) => base.parseTicks(...args),
    parseEvent(p, eventName, playerExtra) {
      const wanted = playerExtra ?? [];
      const pass =
        p === filePath
          ? PREFETCH_PASSES.find((x) => x.events.includes(eventName) && wanted.every((w) => x.extras.includes(w)))
          : undefined;
      const byEvent = pass ? runPass(pass) : "failed";
      if (!pass || byEvent === "failed") return base.parseEvent(p, eventName, playerExtra);
      const wantedSet = new Set(wanted);
      return (byEvent.get(eventName) ?? []).map((row) => stripExtras(row, pass.extras, wantedSet));
    },
  };
}
