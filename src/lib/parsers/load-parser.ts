/**
 * The one place that loads the demo parser.
 *
 * Normally @laihoe/demoparser2 (native bindings, server-only). With
 * E2E_FIXTURE_DEMOS=1 the E2E suite's fixture parser answers instead, so the
 * tests can upload a tiny simulated demo and run the whole real pipeline
 * after the parser (see fixture-demo.ts). Never set it outside tests.
 *
 * PARSE_PROFILE=1 wraps every call with a timer (`parserCallTimings`), for
 * `npm run bench:parse` (S28).
 *
 * Inside `withDemoFile(path, …)` (one analysis) the parser reads every game
 * event of that file in one pass instead of one pass per event
 * (event-prefetch.ts), so the cached rows live only as long as the analysis.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { prefetchingParser } from "./event-prefetch";

export interface DemoParser {
  parseHeader(path: string): Record<string, unknown> | null;
  parsePlayerInfo(path: string): unknown;
  parseEvent(path: string, eventName: string, playerExtra?: string[] | null): unknown;
  /**
   * Several events in one pass over the demo; every row carries `event_name`
   * and the extra props asked for (the union, for every event).
   */
  parseEvents(path: string, eventNames: string[], playerExtra?: string[] | null): unknown;
  /**
   * `structOfArrays` returns `{ prop: values[] }` instead of one object per
   * player per tick (demoparser2 only; read through `parseTickRows`).
   */
  parseTicks(
    path: string,
    wantedProps: string[],
    wantedTicks?: number[] | null,
    wantedPlayers?: string[] | null,
    structOfArrays?: boolean | null
  ): unknown;
}

export interface ParserCallTiming {
  method: string;
  detail: string;
  ms: number;
}

/** Filled only with PARSE_PROFILE=1. */
export const parserCallTimings: ParserCallTiming[] = [];

let parser: DemoParser | null = null;

const scope = new AsyncLocalStorage<DemoParser>();

export async function loadDemoParser(): Promise<DemoParser> {
  const scoped = scope.getStore();
  if (scoped) return scoped;
  return loadBaseParser();
}

async function loadBaseParser(): Promise<DemoParser> {
  if (!parser) {
    const base: DemoParser =
      process.env.E2E_FIXTURE_DEMOS === "1"
        ? (await import("./fixture-demo")).fixtureParser
        : await import("@laihoe/demoparser2");
    parser = process.env.PARSE_PROFILE === "1" ? profiled(base) : base;
  }
  return parser;
}

function profiled(base: DemoParser): DemoParser {
  const time = <T>(method: string, detail: string, run: () => T): T => {
    const started = performance.now();
    try {
      return run();
    } finally {
      parserCallTimings.push({ method, detail, ms: performance.now() - started });
    }
  };
  return {
    parseHeader: (p) => time("parseHeader", "", () => base.parseHeader(p)),
    parsePlayerInfo: (p) => time("parsePlayerInfo", "", () => base.parsePlayerInfo(p)),
    parseEvent: (p, name, extra) => time("parseEvent", name, () => base.parseEvent(p, name, extra)),
    parseEvents: (p, names, extra) =>
      time("parseEvents", names.join(","), () => base.parseEvents(p, names, extra)),
    parseTicks: (p, props, ticks, players, soa) =>
      time("parseTicks", `${props.length} props × ${ticks?.length ?? "all"} ticks`, () =>
        base.parseTicks(p, props, ticks, players, soa)
      ),
  };
}

/**
 * Run one analysis of `filePath`: every `loadDemoParser()` inside it (across
 * awaits, and only for this call chain) reads that file's game events in one
 * pass. Two analyses running side by side in one worker don't share it.
 */
export async function withDemoFile<T>(filePath: string, run: () => Promise<T>): Promise<T> {
  const base = await loadBaseParser();
  const normalized = filePath.replace(/\\/g, "/");
  return scope.run(prefetchingParser(base, normalized), run);
}

type TickRow = Record<string, unknown>;

/**
 * parseTicks as one object per player per tick, built from demoparser2's
 * struct-of-arrays output: the same rows in the same order, about twice as
 * fast as letting the native side build the objects (S28).
 */
export function parseTickRows(
  parser: DemoParser,
  path: string,
  wantedProps: string[],
  wantedTicks?: number[] | null
): TickRow[] {
  const out = parser.parseTicks(path, wantedProps, wantedTicks, null, true);
  if (out == null) return [];
  // The fixture parser ignores the flag and returns rows.
  if (Array.isArray(out)) return out as TickRow[];
  return rowsFromColumns(out as Record<string, unknown[]>);
}

/** `{ prop: values[] }` → one object per index, keys in the columns' order. */
export function rowsFromColumns(columns: Record<string, unknown[]>): TickRow[] {
  const keys = Object.keys(columns);
  const cols = keys.map((k) => columns[k]);
  const n = cols.reduce((max, c) => Math.max(max, c?.length ?? 0), 0);
  const rows: TickRow[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row: TickRow = {};
    for (let k = 0; k < keys.length; k++) row[keys[k]] = cols[k][i];
    rows[i] = row;
  }
  return rows;
}
