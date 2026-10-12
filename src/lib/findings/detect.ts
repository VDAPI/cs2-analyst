/**
 * Detectors: turn the stored analysis (MechanicsStats / AimStats moments) into
 * Findings — one detected mistake at one moment of one round, with a severity,
 * the numbers behind it and one piece of advice.
 *
 * Pure module (no DB), covered by `npm run test:findings`. Every input moment
 * was already judged by what the player could know (see aim.ts), so detectors
 * only grade and phrase it.
 *
 * Adding a detector (S11, S12): write `fromX(rows): FindingDraft[]` next to the
 * ones below and call it in `detectFindings`.
 */
import type { MovementMoment } from "@/lib/analysis/movement";
import type { AimMoment } from "@/lib/analysis/aim";
import type { TacticsMoment } from "@/lib/analysis/tactics";
import { weaponLabel } from "@/lib/utils/weapons";
import { FINDING_TYPES, type FindingCategory, type FindingSeverity, type FindingType } from "./catalog";

/** Bump when detectors or severities change, so stored findings are rebuilt. */
export const FINDINGS_VERSION = 2;

/** One number on a finding card ("Prędkość 180 u/s, próg 73"). */
export interface FindingValue {
  label: string;
  value: number;
  unit: string;
  /** Threshold or reference the value is judged against. */
  ref?: number;
}

export interface FindingDraft {
  type: FindingType;
  category: FindingCategory;
  steamId: string;
  severity: FindingSeverity;
  roundNumber: number;
  tick: number;
  /** Seconds since round start (freeze time included). */
  roundTime: number;
  /** Did it cost something (lost duel, damage taken, death, missed shot)? */
  costly: boolean;
  /** The enemy the mistake was against, to highlight in the 2D clip. */
  targetSteamId: string | null;
  values: FindingValue[];
  /** Short facts in Polish. */
  detail: string;
  /** The one piece of advice for this moment. */
  advice: string;
}

export interface MechanicsInput {
  steamId: string;
  moments: MovementMoment[];
}

export interface AimInput {
  steamId: string;
  moments: AimMoment[];
}

export interface TacticsInput {
  steamId: string;
  moments: TacticsMoment[];
}

function draft(
  type: FindingType,
  base: Pick<FindingDraft, "steamId" | "severity" | "roundNumber" | "tick" | "roundTime" | "costly" | "values" | "detail"> & {
    targetSteamId?: string | null;
    advice?: string;
  }
): FindingDraft {
  const def = FINDING_TYPES[type];
  return {
    type,
    category: def.category,
    ...base,
    targetSteamId: base.targetSteamId ?? null,
    advice: base.advice ?? def.advice,
  };
}

// ─── Mechanics 1: moving first shots (S8) ────────────────

export function fromMechanics(rows: MechanicsInput[]): FindingDraft[] {
  const out: FindingDraft[] = [];
  for (const row of rows) {
    for (const m of row.moments) {
      const ratio = m.threshold > 0 ? m.speed / m.threshold : 1;
      const fast = m.airborne || ratio >= 2;
      const values: FindingValue[] = [
        { label: "Prędkość", value: m.speed, unit: "u/s", ref: m.threshold },
      ];
      const gun = weaponLabel(m.weapon);
      const result = m.hit ? "trafienie" : "pudło";

      if (m.strafeMs != null && m.strafeMs > 0 && !m.airborne) {
        // Was braking but fired before reaching accurate speed.
        values.push({ label: "Hamowanie", value: m.strafeMs, unit: "ms" });
        out.push(
          draft("late_strafe", {
            steamId: row.steamId,
            severity: m.hit ? "low" : fast ? "high" : "medium",
            roundNumber: m.roundNumber,
            tick: m.tick,
            roundTime: m.roundTime,
            costly: !m.hit,
            targetSteamId: m.enemy ?? null,
            values,
            detail: `${gun}: strzał po ${m.strafeMs} ms hamowania przy ${m.speed} u/s (celnie poniżej ${m.threshold}), ${result}`,
            advice:
              m.strafeMs < 60
                ? "Hamowanie dopiero się zaczęło: stuknij przeciwny klawisz wcześniej, zanim wróg wejdzie w celownik."
                : `Brakowało kilkudziesięciu ms: poczekaj, aż prędkość spadnie poniżej ${m.threshold} u/s, i dopiero wtedy strzel.`,
          })
        );
        continue;
      }

      out.push(
        draft("moving_shot", {
          steamId: row.steamId,
          severity: m.hit ? "low" : fast ? "high" : "medium",
          roundNumber: m.roundNumber,
          tick: m.tick,
          roundTime: m.roundTime,
          costly: !m.hit,
          targetSteamId: m.enemy ?? null,
          values,
          detail: m.airborne
            ? `${gun}: pierwszy strzał pojedynku w powietrzu, ${result}`
            : `${gun}: pierwszy strzał pojedynku przy ${m.speed} u/s (celnie poniżej ${m.threshold}), ${result}`,
          advice: m.airborne
            ? "Nie zaczynaj pojedynku w skoku: wyląduj i zatrzymaj się, zanim strzelisz."
            : undefined,
        })
      );
    }
  }
  return out;
}

// ─── Mechanics 2: aim and duels (S9) ─────────────────────

const AIM_TYPE: Record<AimMoment["type"], FindingType> = {
  crosshair: "crosshair",
  reaction: "reaction",
  spray: "spray",
  overflick: "overflick",
  dry_peek: "dry_peek",
  noise: "noise",
  jump: "jump",
  air_shot: "air_shot",
  reload: "reload",
};

/** SSG 08 is accurate at the top of a jump — jump-scouting is a technique, not a mistake. */
const JUMP_ACCURATE = new Set(["ssg08"]);

export function fromAim(rows: AimInput[]): FindingDraft[] {
  const out: FindingDraft[] = [];
  for (const row of rows) {
    for (const m of row.moments) {
      const type = AIM_TYPE[m.type];
      if (!type) continue;
      const base = {
        steamId: row.steamId,
        roundNumber: m.roundNumber,
        tick: m.tick,
        roundTime: m.roundTime,
        costly: m.costly,
        targetSteamId: m.enemy ?? null,
        detail: m.detail,
      };
      switch (m.type) {
        case "crosshair":
          out.push(
            draft(type, {
              ...base,
              severity: m.costly ? (m.value >= 30 ? "high" : "medium") : m.value >= 30 ? "medium" : "low",
              values: [{ label: "Od głowy", value: m.value, unit: "°", ref: 15 }],
              detail: `${m.detail}${m.costly ? ", przegrany pojedynek" : ""}`,
            })
          );
          break;
        case "reaction":
          out.push(
            draft(type, {
              ...base,
              severity: m.value >= 600 ? "high" : "medium",
              values: [{ label: "Reakcja", value: m.value, unit: "ms", ref: 300 }],
            })
          );
          break;
        case "spray":
          out.push(
            draft(type, {
              ...base,
              severity: m.value >= 8 ? "medium" : "low",
              values: [{ label: "Kule w serii", value: m.value, unit: "" }],
            })
          );
          break;
        case "overflick":
          out.push(
            draft(type, {
              ...base,
              severity: m.costly ? "medium" : "low",
              values: [{ label: "Za daleko o", value: m.value, unit: "°" }],
            })
          );
          break;
        case "dry_peek":
          out.push(
            draft(type, {
              ...base,
              severity: "high",
              values: [{ label: "Prędkość peeku", value: m.value, unit: "u/s" }],
            })
          );
          break;
        case "noise":
          out.push(
            draft(type, {
              ...base,
              severity: m.costly ? "high" : "medium",
              values: [{ label: "Bieg", value: m.value, unit: "s" }],
            })
          );
          break;
        case "jump":
          out.push(
            draft(type, {
              ...base,
              severity: m.costly ? "high" : "medium",
              values: [{ label: "Do wroga", value: m.value, unit: "u" }],
            })
          );
          break;
        case "air_shot":
          if (m.weapon && JUMP_ACCURATE.has(m.weapon)) break;
          out.push(
            draft(type, {
              ...base,
              severity: "low",
              values: [{ label: "Prędkość pionowa", value: m.value, unit: "u/s" }],
              detail: m.weapon ? `strzał w powietrzu z ${weaponLabel(m.weapon)}` : m.detail,
            })
          );
          break;
        case "reload":
          out.push(
            draft(type, {
              ...base,
              severity: m.costly ? "high" : "medium",
              values: m.value >= 0 ? [{ label: "W magazynku", value: m.value, unit: "kul" }] : [],
            })
          );
          break;
      }
    }
  }
  return out;
}

// ─── Tactics: teamplay, economy, positions (S12) ────────

/** Advice for sub-cases of a type; the catalog advice covers the rest. */
const TACTICS_ADVICE: Record<string, string> = {
  "clutch_decision:save":
    "Bez szans na rozbrojenie schowaj się i uratuj broń; dwie kolejne rundy z karabinem są warte więcej niż ta jedna.",
  "clutch_decision:no_plant":
    "Sam z bombą przy końcu czasu: idź na plant najkrótszą drogą albo zrezygnuj wcześnie i ratuj broń, nie czekaj do zera.",
  "clutch_decision:time":
    "Po plancie w clutchu czas gra dla ciebie: schowaj się w pozycji na bombę i strzelaj dopiero, gdy CT zaczyna rozbrajać.",
  "death_with_money:last_round":
    "W ostatniej rundzie połowy kasa przepada: wydaj wszystko na utility, pancerz i najlepszą broń, albo kup koledze.",
};

const TACTICS_SEVERITY: Record<TacticsMoment["type"], (m: TacticsMoment) => FindingSeverity> = {
  untraded_death: (m) => (m.lost ? "high" : "medium"),
  missed_trade: (m) => (m.costly || m.lost ? "high" : "medium"),
  entry_death: (m) => (m.lost ? "high" : "medium"),
  lurk_death: (m) => (m.lost ? "high" : "medium"),
  early_rotation: (m) => (m.lost ? "high" : "medium"),
  postplant_death: (m) => (m.lost ? "high" : "low"),
  retake_solo: (m) => (m.lost ? "high" : "medium"),
  clutch_decision: (m) => (m.variant === "time" ? "high" : "medium"),
  bad_force: () => "medium",
  no_drop: (m) => (m.lost ? "medium" : "low"),
  death_with_money: (m) => (m.variant === "last_round" && m.lost ? "medium" : "low"),
  predictable_position: (m) => (m.costly ? "medium" : "low"),
};

export function fromTactics(rows: TacticsInput[]): FindingDraft[] {
  const out: FindingDraft[] = [];
  for (const row of rows) {
    for (const m of row.moments) {
      if (!(m.type in FINDING_TYPES)) continue;
      out.push(
        draft(m.type, {
          steamId: row.steamId,
          severity: TACTICS_SEVERITY[m.type](m),
          roundNumber: m.roundNumber,
          tick: m.tick,
          roundTime: m.roundTime,
          costly: m.costly,
          targetSteamId: m.enemy ?? null,
          values: m.values,
          detail: m.detail,
          advice: m.variant ? TACTICS_ADVICE[`${m.type}:${m.variant}`] : undefined,
        })
      );
    }
  }
  return out;
}

/** Every detector, in one place. S11 adds its own here. */
export function detectFindings(input: {
  mechanics: MechanicsInput[];
  aim: AimInput[];
  tactics?: TacticsInput[];
}): FindingDraft[] {
  return [...fromMechanics(input.mechanics), ...fromAim(input.aim), ...fromTactics(input.tactics ?? [])].sort(
    (a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick || a.steamId.localeCompare(b.steamId)
  );
}
