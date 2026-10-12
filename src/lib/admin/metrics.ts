/**
 * Admin panel metrics: analyses per day, parse time summary, stuck analyses.
 * Pure, so `npm run test:admin` covers it without a database.
 */
import type { ParseStatus } from "@prisma/client";
import { APP_TIME_ZONE } from "@/lib/utils/formatters";

/** Days are counted in the owner's time zone, not UTC. */
export const METRICS_TIME_ZONE = APP_TIME_ZONE;

/** An analysis that sat in QUEUED/DOWNLOADING/PARSING this long without an update is stuck. */
export const STUCK_AFTER_MS = 30 * 60 * 1000;

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: METRICS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" of the instant in METRICS_TIME_ZONE. */
export function dayKey(d: Date): string {
  return dayKeyFormat.format(d);
}

export interface DailyCount {
  day: string; // YYYY-MM-DD
  completed: number;
  failed: number;
  /** Still queued, downloading or parsing. */
  pending: number;
}

/**
 * One row per day for the last `days` days (oldest first, today last), with
 * every upload counted on the day it was created. Days with nothing are 0.
 */
export function dailyCounts(
  uploads: { createdAt: Date; status: ParseStatus }[],
  days: number,
  now: Date = new Date()
): DailyCount[] {
  const rows: DailyCount[] = [];
  const index = new Map<string, DailyCount>();
  // Walk calendar days from today's local date (UTC date math on the key, so
  // DST changes can't skip or repeat a day).
  const today = new Date(`${dayKey(now)}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const row = { day, completed: 0, failed: 0, pending: 0 };
    index.set(day, row);
    rows.push(row);
  }
  for (const u of uploads) {
    const row = index.get(dayKey(u.createdAt));
    if (!row) continue;
    if (u.status === "COMPLETED") row.completed++;
    else if (u.status === "FAILED") row.failed++;
    else row.pending++;
  }
  return rows;
}

/** Nearest-rank percentile (p in 0..100) of unsorted values; null when empty. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((Math.min(100, Math.max(0, p)) / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

export interface ParseTimeSummary {
  count: number;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
}

export function parseTimeSummary(ms: number[]): ParseTimeSummary {
  const valid = ms.filter((v) => Number.isFinite(v) && v >= 0);
  if (valid.length === 0) return { count: 0, avgMs: null, p50Ms: null, p95Ms: null, maxMs: null };
  return {
    count: valid.length,
    avgMs: Math.round(valid.reduce((a, b) => a + b, 0) / valid.length),
    p50Ms: percentile(valid, 50),
    p95Ms: percentile(valid, 95),
    maxMs: Math.max(...valid),
  };
}

const IN_FLIGHT: ParseStatus[] = ["QUEUED", "DOWNLOADING", "PARSING"];

/** In flight but untouched for STUCK_AFTER_MS: the worker died or never picked it up. */
export function isStuck(
  u: { status: ParseStatus; updatedAt: Date },
  now: Date = new Date()
): boolean {
  return IN_FLIGHT.includes(u.status) && now.getTime() - u.updatedAt.getTime() > STUCK_AFTER_MS;
}

/** "1,2 s", "48 s", "2 min 05 s" — for parse times. */
export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}
