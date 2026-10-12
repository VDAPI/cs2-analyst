/**
 * Tactic board data (S17): a map with numbered steps, each a list of items —
 * player tokens, utility, arrows, freehand lines and text. Coordinates are
 * normalised to the radar (0–1, x right, y down), so a board does not depend
 * on the canvas size it was drawn at.
 *
 * The zod schema is the single gate for what the API stores; it also bounds
 * the size (a board must fit the 64 KB JSON body limit, S29).
 *
 * Pure module, covered by `npm run test:team`.
 */
import { z } from "zod";
import { makeWorldToCanvas, type RadarConfig } from "@/lib/canvas/radar";

export const BOARD_VERSION = 1;
export const MAX_STEPS = 12;
export const MAX_ITEMS = 80;
export const MAX_POINTS = 120;
export const MAX_TEXT = 40;
export const BOARD_NAME_MAX = 60;
/** Serialised `data` above this is refused (body limit is 64 KB). */
export const MAX_BOARD_BYTES = 60_000;

export const BOARD_COLORS = ["ct", "t", "accent", "lime", "mistake", "white"] as const;
export type BoardColor = (typeof BOARD_COLORS)[number];
export const UTILITY_TYPES = ["SMOKE", "FLASH", "MOLOTOV", "HE"] as const;
export type BoardUtility = (typeof UTILITY_TYPES)[number];

const coord = z.number().finite().min(0).max(1);
const id = z.string().min(1).max(24);
const point = z.tuple([coord, coord]);

export const boardItemSchema = z.discriminatedUnion("kind", [
  z.object({ id, kind: z.literal("player"), side: z.enum(["CT", "T"]), label: z.string().max(16), x: coord, y: coord }),
  z.object({ id, kind: z.literal("util"), type: z.enum(UTILITY_TYPES), x: coord, y: coord }),
  z.object({
    id,
    kind: z.literal("arrow"),
    color: z.enum(BOARD_COLORS),
    dashed: z.boolean().optional(),
    points: z.array(point).min(2).max(MAX_POINTS),
  }),
  z.object({ id, kind: z.literal("line"), color: z.enum(BOARD_COLORS), points: z.array(point).min(2).max(MAX_POINTS) }),
  z.object({ id, kind: z.literal("text"), color: z.enum(BOARD_COLORS), text: z.string().min(1).max(MAX_TEXT), x: coord, y: coord }),
]);

export const boardStepSchema = z.object({
  name: z.string().max(40),
  /** What the team does in this step (call, timing). */
  note: z.string().max(400).optional(),
  items: z.array(boardItemSchema).max(MAX_ITEMS),
});

export const boardDataSchema = z.object({
  v: z.literal(BOARD_VERSION),
  steps: z.array(boardStepSchema).min(1).max(MAX_STEPS),
});

export type BoardItem = z.infer<typeof boardItemSchema>;
export type BoardStep = z.infer<typeof boardStepSchema>;
export type BoardData = z.infer<typeof boardDataSchema>;

/** Parsed board data, or null when it is not a valid board / too big. */
export function parseBoardData(raw: unknown): BoardData | null {
  const parsed = boardDataSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (JSON.stringify(parsed.data).length > MAX_BOARD_BYTES) return null;
  return parsed.data;
}

/** Rounded to 4 decimals (0.1 px on a 1024 px canvas) to keep boards small. */
export const q = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10_000) / 10_000;

/** Five CT and five T tokens in the corners of an empty step. */
export function defaultItems(): BoardItem[] {
  const items: BoardItem[] = [];
  for (let i = 0; i < 5; i++) {
    items.push({ id: `ct${i + 1}`, kind: "player", side: "CT", label: String(i + 1), x: q(0.06 + i * 0.055), y: 0.05 });
    items.push({ id: `t${i + 1}`, kind: "player", side: "T", label: String(i + 1), x: q(0.06 + i * 0.055), y: 0.95 });
  }
  return items;
}

export function emptyBoard(stepName = "1"): BoardData {
  return { v: BOARD_VERSION, steps: [{ name: stepName, items: defaultItems() }] };
}

/** A new step that starts where the previous one ended (players and utility, no drawings). */
export function nextStep(prev: BoardStep, name: string): BoardStep {
  return { name, items: prev.items.filter((i) => i.kind === "player" || i.kind === "util").map((i) => ({ ...i })) };
}

/** World position → normalised radar position (null config = Mirage's numbers). */
export function worldToBoard(config: RadarConfig | null, x: number, y: number): { x: number; y: number } {
  const p = makeWorldToCanvas(config, 1)(x, y);
  return { x: q(p.x), y: q(p.y) };
}

/**
 * A board with the rival's typical positions (anti-strat): their tokens on
 * their side, numbered by name, plus our five tokens in the corner.
 */
export function boardFromTokens(
  config: RadarConfig | null,
  rivalSide: "CT" | "T",
  tokens: Array<{ name: string; x: number; y: number }>
): BoardData {
  const ours: "CT" | "T" = rivalSide === "CT" ? "T" : "CT";
  const items: BoardItem[] = tokens.slice(0, 5).map((t, i) => {
    const p = worldToBoard(config, t.x, t.y);
    return { id: `r${i + 1}`, kind: "player", side: rivalSide, label: t.name.slice(0, 16), x: p.x, y: p.y };
  });
  for (let i = 0; i < 5; i++) {
    items.push({ id: `o${i + 1}`, kind: "player", side: ours, label: String(i + 1), x: q(0.06 + i * 0.055), y: ours === "CT" ? 0.05 : 0.95 });
  }
  return { v: BOARD_VERSION, steps: [{ name: "1", items }] };
}

/** Short unique id for a new item. */
export function newItemId(existing: Iterable<string>): string {
  const used = new Set(existing);
  for (let n = used.size + 1; ; n++) {
    const id = `i${n.toString(36)}`;
    if (!used.has(id)) return id;
  }
}

/**
 * Freehand / arrow stroke simplified to at most MAX_POINTS points: drop points
 * closer than `minDist` to the last kept one, then thin evenly.
 */
export function simplifyStroke(points: Array<[number, number]>, minDist = 0.004): Array<[number, number]> {
  if (points.length <= 2) return points.map(([x, y]) => [q(x), q(y)]);
  const kept: Array<[number, number]> = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [lx, ly] = kept[kept.length - 1];
    if (Math.hypot(points[i][0] - lx, points[i][1] - ly) >= minDist) kept.push(points[i]);
  }
  kept.push(points[points.length - 1]);
  let out = kept;
  if (out.length > MAX_POINTS) {
    const step = (out.length - 1) / (MAX_POINTS - 1);
    out = Array.from({ length: MAX_POINTS }, (_, i) => kept[Math.round(i * step)]);
  }
  return out.map(([x, y]) => [q(x), q(y)]);
}
