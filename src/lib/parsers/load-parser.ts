/**
 * The one place that loads the demo parser.
 *
 * Normally @laihoe/demoparser2 (native bindings, server-only). With
 * E2E_FIXTURE_DEMOS=1 the E2E suite's fixture parser answers instead, so the
 * tests can upload a tiny simulated demo and run the whole real pipeline
 * after the parser (see fixture-demo.ts). Never set it outside tests.
 */
export interface DemoParser {
  parseHeader(path: string): Record<string, unknown> | null;
  parsePlayerInfo(path: string): unknown;
  parseEvent(path: string, eventName: string, playerExtra?: string[] | null): unknown;
  parseTicks(path: string, wantedProps: string[], wantedTicks?: number[] | null): unknown;
}

let parser: DemoParser | null = null;

export async function loadDemoParser(): Promise<DemoParser> {
  if (!parser) {
    parser =
      process.env.E2E_FIXTURE_DEMOS === "1"
        ? (await import("./fixture-demo")).fixtureParser
        : await import("@laihoe/demoparser2");
  }
  return parser;
}
