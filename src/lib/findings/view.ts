/**
 * A stored Finding as the UI gets it (report page, replay markers, API): plain
 * JSON with the catalog label, safe to pass to client components.
 */
import type { Finding } from "@prisma/client";
import { findingDef, type FindingSeverity } from "./catalog";
import type { FindingValue } from "./detect";

export interface FindingView {
  id: string;
  type: string;
  label: string;
  category: string;
  severity: FindingSeverity;
  steamId: string;
  targetSteamId: string | null;
  roundNumber: number;
  tick: number;
  roundTime: number;
  costly: boolean;
  values: FindingValue[];
  detail: string;
  advice: string;
  /** What it cost the team (S14): round win probability before / after, 0–1. */
  wp?: { before: number; after: number; kind: string } | null;
  /** Role the severity / advice were adjusted for (S31). */
  role?: string | null;
}

export function toFindingView(f: Finding): FindingView {
  return {
    id: f.id,
    type: f.type,
    label: findingDef(f.type).label,
    category: f.category,
    severity: (["high", "medium", "low"].includes(f.severity) ? f.severity : "low") as FindingSeverity,
    steamId: f.steamId,
    targetSteamId: f.targetSteamId,
    roundNumber: f.roundNumber,
    tick: f.tick,
    roundTime: f.roundTime,
    costly: f.costly,
    values: Array.isArray(f.values) ? (f.values as unknown as FindingValue[]) : [],
    detail: f.detail,
    advice: f.advice,
    wp:
      f.wpBefore != null && f.wpAfter != null
        ? { before: f.wpBefore, after: f.wpAfter, kind: f.wpKind ?? "death" }
        : null,
    role: f.role,
  };
}

/** "1:23" from seconds since round start. */
export function fmtRoundTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** "180 u/s (próg 73)" */
export function fmtFindingValue(v: FindingValue): string {
  const unit = v.unit === "" ? "" : v.unit === "°" ? "°" : ` ${v.unit}`;
  return `${v.value}${unit}${v.ref != null ? ` (próg ${v.ref}${unit})` : ""}`;
}

/** Deep link into the full replay at this finding, with the player selected. */
export function replayHref(matchId: string, f: Pick<FindingView, "id" | "roundNumber" | "tick" | "steamId">): string {
  return `/replay/${matchId}?round=${f.roundNumber}&tick=${f.tick}&player=${f.steamId}&finding=${f.id}`;
}
