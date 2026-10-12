/**
 * Pure helpers for demoparser2 `round_end` rows.
 *
 * demoparser2 0.41 returns `winner` and `reason` as numbers on CS2 demos
 * (`{ winner: 2, reason: 9, message: "#SFUI_Notice_Terrorists_Win" }`), older
 * builds / other sources may give strings ("T", "CT", "bomb_defused"). Both
 * forms are accepted.
 */

import type { Side } from "@/lib/utils/sideSplit";

/** 2 / "2" / "T" → T, 3 / "3" / "CT" → CT, anything else (draw, game start) → null. */
export function parseRoundWinner(winner: unknown, message?: unknown): Side | null {
  if (winner === 2 || winner === "2") return "T";
  if (winner === 3 || winner === "3") return "CT";
  if (typeof winner === "string") {
    const w = winner.trim().toUpperCase();
    if (w === "T" || w === "TERRORIST" || w === "TERRORISTS") return "T";
    if (w === "CT" || w === "COUNTERTERRORIST" || w === "COUNTER-TERRORIST") return "CT";
  }
  // Fall back to the end-of-round notice.
  if (typeof message === "string") {
    const m = message.toLowerCase();
    if (m.includes("terrorists_win") || m.includes("target_bombed") || m.includes("cts_surrender")) return "T";
    if (
      m.includes("cts_win") ||
      m.includes("bomb_defused") ||
      m.includes("target_saved") ||
      m.includes("terrorists_surrender")
    ) {
      return "CT";
    }
  }
  return null;
}

export type ParsedWinReason = "ELIMINATION" | "BOMB_EXPLODED" | "BOMB_DEFUSED" | "TIME_RAN_OUT";

/**
 * CS2 RoundEndReason codes (same numbering as CS:GO):
 * 1 target bombed, 7 bomb defused, 8 CTs win (elimination), 9 Ts win
 * (elimination), 12 target saved (time ran out), 17/18 T/CT surrender.
 * Surrenders have no dedicated WinReason and are stored as ELIMINATION.
 */
export function parseWinReason(reason: unknown, message?: unknown): ParsedWinReason {
  const code = typeof reason === "number" ? reason : typeof reason === "string" && /^\d+$/.test(reason.trim()) ? Number(reason) : null;
  if (code !== null) {
    if (code === 1) return "BOMB_EXPLODED";
    if (code === 7) return "BOMB_DEFUSED";
    if (code === 12) return "TIME_RAN_OUT";
    if (code === 8 || code === 9 || code === 17 || code === 18) return "ELIMINATION";
  }
  const text = `${typeof reason === "string" ? reason : ""} ${typeof message === "string" ? message : ""}`.toLowerCase();
  if (text.includes("bomb_exploded") || text.includes("target_bombed")) return "BOMB_EXPLODED";
  if (text.includes("bomb_defused") || text.includes("defuse")) return "BOMB_DEFUSED";
  if (text.includes("time") || text.includes("target_saved")) return "TIME_RAN_OUT";
  return "ELIMINATION";
}
