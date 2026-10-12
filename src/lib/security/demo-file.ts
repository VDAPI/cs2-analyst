/**
 * .dem file validation (S29). Every CS2 demo starts with the 8-byte magic
 * "PBDEMS2\0"; CS:GO demos start with "HL2DEMO\0" and demoparser2 can't read
 * them. Checking the first bytes before storing a file stops renamed
 * archives, executables and CS:GO demos at the door instead of in the parse
 * worker.
 *
 * The E2E suite uploads JSON fixture demos (src/lib/parsers/fixture-demo.ts);
 * they pass only when E2E_FIXTURE_DEMOS=1, never in a real deployment.
 */
import { open } from "node:fs/promises";

export const CS2_DEMO_MAGIC = "PBDEMS2\0";
export const CSGO_DEMO_MAGIC = "HL2DEMO\0";
const FIXTURE_PREFIX = '{"magic":"cs2-analyst-e2e-fixture-demo"';

/** Bytes needed by `classifyDemoHeader`. */
export const DEMO_HEADER_BYTES = FIXTURE_PREFIX.length;

export type DemoHeaderKind = "cs2" | "csgo" | "fixture" | "unknown";

/** What the first bytes of a file say it is. Pure. */
export function classifyDemoHeader(head: Uint8Array, allowFixtures = fixturesAllowed()): DemoHeaderKind {
  const text = Buffer.from(head).toString("latin1");
  if (text.startsWith(CS2_DEMO_MAGIC)) return "cs2";
  if (text.startsWith(CSGO_DEMO_MAGIC)) return "csgo";
  if (allowFixtures && text.startsWith(FIXTURE_PREFIX)) return "fixture";
  return "unknown";
}

export function fixturesAllowed(): boolean {
  return process.env.E2E_FIXTURE_DEMOS === "1";
}

/** null when the header is a demo the parser can read, otherwise the reason (English, like the other API errors). */
export function demoHeaderError(kind: DemoHeaderKind): string | null {
  switch (kind) {
    case "cs2":
    case "fixture":
      return null;
    case "csgo":
      return "This is a CS:GO demo. Only CS2 demos can be analysed.";
    default:
      return "This file is not a CS2 demo";
  }
}

/** Reads the first bytes of a file on disk and checks them. */
export async function checkDemoFile(path: string): Promise<string | null> {
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(DEMO_HEADER_BYTES);
    const { bytesRead } = await fh.read(buf, 0, DEMO_HEADER_BYTES, 0);
    return demoHeaderError(classifyDemoHeader(buf.subarray(0, bytesRead)));
  } finally {
    await fh.close();
  }
}
