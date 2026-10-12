/**
 * 2D clips (S25): what a clip is (a tick window of one round, about one
 * player), how a shared clip is stored (`Share.clip`), and the frame plan
 * of an exported MP4/GIF. Pure and browser-safe, covered by
 * `npm run test:social`.
 */
import { z } from "zod";
import type { TFunction } from "@/lib/i18n/translate";

/** Longest clip, seconds (export and shared links). */
export const MAX_CLIP_SECONDS = 30;
export const CLIP_TICK_RATE = 64;

export type ClipFormat = "mp4" | "gif";

/** Output size (square, px) and frame rate per format. GIFs stay small enough for a chat. */
export const EXPORT_SETTINGS: Record<ClipFormat, { size: number; fps: number }> = {
  mp4: { size: 720, fps: 30 },
  gif: { size: 420, fps: 12 },
};
/** The last frame is held this long at the end of an exported clip. */
export const EXPORT_HOLD_S = 0.8;

export const CLIP_KINDS = ["clutch", "ace", "4k", "3k", "finding"] as const;
export type ClipKind = (typeof CLIP_KINDS)[number];

const tick = z.number().int().min(0).max(10_000_000);

/** `Share.clip` of a clip link: what to draw, validated on write and read. */
export const clipShareSchema = z
  .object({
    from: tick,
    to: tick,
    focus: tick,
    kind: z.enum(CLIP_KINDS),
    clutch: z.number().int().min(1).max(5).nullable().optional(),
    kills: z.number().int().min(0).max(10).optional(),
    findingType: z.string().max(64).optional(),
    severity: z.enum(["high", "medium", "low"]).optional(),
    target: z.string().max(32).nullable().optional(),
    marks: z.array(tick).max(10).default([]),
    follow: z.boolean().default(false),
  })
  .refine((c) => c.to > c.from && c.to - c.from <= MAX_CLIP_SECONDS * CLIP_TICK_RATE, "bad range")
  .refine((c) => c.focus >= c.from && c.focus <= c.to, "focus outside range");

export type ClipShare = z.infer<typeof clipShareSchema>;

export function parseClipShare(json: unknown): ClipShare | null {
  const r = clipShareSchema.safeParse(json);
  return r.success ? r.data : null;
}

/**
 * Game tick of every frame of an exported clip: real time (1×) at `fps`,
 * from `from` to `to` inclusive, then the last frame held for EXPORT_HOLD_S.
 */
export function exportTicks(from: number, to: number, fps: number, tickRate = CLIP_TICK_RATE): number[] {
  const step = tickRate / fps;
  const out: number[] = [];
  for (let t = from; t < to; t += step) out.push(Math.round(t * 100) / 100);
  out.push(to);
  const hold = Math.round(EXPORT_HOLD_S * fps);
  for (let i = 0; i < hold; i++) out.push(to);
  return out;
}

/** ASCII-only file name, e.g. "cs2-analyst-mirage-r14-clutch-1v3.mp4". */
export function clipFileName(parts: { map: string; round: number; label: string }, ext: string): string {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/ł/g, "l")
      .replace(/Ł/g, "L")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/^de_/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const name = ["cs2-analyst", slug(parts.map), `r${parts.round}`, slug(parts.label)].filter(Boolean).join("-").slice(0, 80);
  return `${name}.${ext}`;
}

/** "Clutch 1v3 · 3K", "Ace", "4K" — the title of a highlight. */
export function highlightTitle(t: TFunction, h: { kind: ClipKind; clutch?: number | null; kills?: number }): string {
  if (h.kind === "clutch") {
    const base = t("clips.kind.clutch", { n: h.clutch ?? 1 });
    const kills = h.kills ?? 0;
    return kills >= 3 ? `${base} · ${kills >= 5 ? t("clips.kind.ace") : `${kills}K`}` : base;
  }
  if (h.kind === "ace") return t("clips.kind.ace");
  if (h.kind === "4k" || h.kind === "3k") return h.kind.toUpperCase();
  return t("clips.kind.finding");
}

/** The shared form of a finding's 2D clip (the same window as on the report). */
export function findingClipShare(
  f: { type: string; tick: number; severity: "high" | "medium" | "low"; targetSteamId: string | null },
  clip: { before: number; after: number }
): ClipShare {
  const half = (MAX_CLIP_SECONDS * CLIP_TICK_RATE) / 2;
  const before = Math.min(half, Math.round(clip.before * CLIP_TICK_RATE));
  const after = Math.max(1, Math.min(half, Math.round(clip.after * CLIP_TICK_RATE)));
  const from = Math.max(0, f.tick - before);
  return {
    from,
    to: f.tick + after,
    focus: f.tick,
    kind: "finding",
    findingType: f.type,
    severity: f.severity,
    target: f.targetSteamId,
    marks: [],
    follow: false,
  };
}

/** The shared form of a highlight's clip. */
export function highlightClipShare(h: {
  kind: Exclude<ClipKind, "finding">;
  clutch: number | null;
  kills: number;
  from: number;
  to: number;
  focus: number;
  marks: number[];
}): ClipShare {
  return {
    from: h.from,
    to: h.to,
    focus: h.focus,
    kind: h.kind,
    clutch: h.clutch,
    kills: h.kills,
    marks: h.marks.slice(-10),
    follow: true,
  };
}
