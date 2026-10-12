/**
 * Roles as the report and "play like a pro" show them (S24). Pure.
 *
 * Every role has the report metrics that matter most for it (ROLE_METRICS);
 * the player's value is compared with pros of the same role ("pro/<role>"
 * norms), falling back to every pro until that pool has enough samples.
 * Role-specific advice is one line per role and metric (`roles.advice.*`).
 */
import type { MessageKey } from "@/lib/i18n/translate";
import {
  METRIC_DIRECTION,
  proNorm,
  roleNorm,
  sampleKey,
  verdictVs,
  type NormContext,
  type NormTable,
  type ProNorm,
  type SampleMetrics,
  type Situation,
} from "@/lib/norms/norms";
import { METRIC_UNIT } from "@/lib/norms/view";
import { isRole, type Role, type SideProfile } from "./roles";

export interface RoleMetric {
  metric: string;
  situation: Situation;
}

const m = (metric: string, situation: Situation = "all"): RoleMetric => ({ metric, situation });

/** The metrics each role is judged on first, most telling first. */
export const ROLE_METRICS: Record<Role, RoleMetric[]> = {
  entry: [m("opening"), m("traded_deaths"), m("reaction"), m("first_bullet"), m("moving_first"), m("dry_peek")],
  awp: [m("first_bullet", "awp"), m("moving_first", "awp"), m("opening"), m("reaction"), m("crosshair"), m("traded_deaths")],
  lurk: [m("noise"), m("opening"), m("crosshair"), m("reaction"), m("unused_utility"), m("jump")],
  anchor: [m("same_spot"), m("crosshair"), m("preaim"), m("molotov_damage"), m("unused_utility"), m("reaction")],
  support: [m("flash_blind"), m("flash_follow"), m("team_flash"), m("trades"), m("he_damage"), m("smoke_wasted")],
};

export const roleKey = (role: Role): MessageKey => `roles.name.${role}` as MessageKey;
export const roleDescKey = (role: Role): MessageKey => `roles.desc.${role}` as MessageKey;
export const roleAdviceKey = (role: Role, metric: string): MessageKey => `roles.advice.${role}.${metric}` as MessageKey;
export const ROLE_TIP_COUNT = 3;
export const roleTipKeys = (role: Role): MessageKey[] =>
  Array.from({ length: ROLE_TIP_COUNT }, (_, i) => `roles.tip.${role}.${i + 1}` as MessageKey);

/** Role colour token: lime for the AWP, violet for the rest, CT/T tones where they fit. */
export const ROLE_TONE: Record<Role, string> = {
  entry: "var(--mistake)",
  awp: "var(--accent-2)",
  lurk: "var(--t-gold)",
  anchor: "var(--ct-blue)",
  support: "var(--accent)",
};

export interface RoleMetricComparison extends RoleMetric {
  key: string;
  unit: string;
  value: number | null;
  norm: ProNorm | null;
  /** The norm is measured on pros of this role (false: every pro, or the reference values). */
  roleSpecific: boolean;
  verdict: "better" | "within" | "worse" | null;
}

/**
 * A role's metrics for one sample (a match's NormSample metrics, or a median
 * of several) against pros of that role.
 */
export function compareRoleMetrics(
  role: Role,
  values: SampleMetrics | Record<string, { value: number }>,
  table: NormTable | null,
  ctx: NormContext
): RoleMetricComparison[] {
  return ROLE_METRICS[role].map((rm) => {
    const key = sampleKey(rm.metric, rm.situation);
    const entry = values[key];
    const value = Array.isArray(entry) ? entry[0] : (entry?.value ?? null);
    const ctxS = { ...ctx, situation: rm.situation };
    const byRole = roleNorm(table, role, rm.metric, ctxS);
    const norm = byRole ?? proNorm(table, rm.metric, ctxS);
    const direction = METRIC_DIRECTION[rm.metric];
    return {
      ...rm,
      key,
      unit: METRIC_UNIT[rm.metric] ?? "",
      value: typeof value === "number" && Number.isFinite(value) ? value : null,
      norm,
      roleSpecific: byRole != null,
      verdict: norm && direction ? verdictVs(value, norm, direction) : null,
    };
  });
}

/** Up to `max` metrics the player is worse at than the pros, the most telling first: the role's advice. */
export function roleAdvice(cmps: RoleMetricComparison[], max = 3): RoleMetricComparison[] {
  return cmps.filter((c) => c.verdict === "worse").slice(0, max);
}

// ─── Profiles (timing, spacing, positions) ───────────────

export type ProfileKey = "firstContact" | "contactTime" | "deathTime" | "teamDistance" | "awpShare" | "siteShare";

export const PROFILE_FIELDS: Array<{ key: ProfileKey; unit: string; sides: Array<"CT" | "T"> }> = [
  { key: "firstContact", unit: "%", sides: ["T", "CT"] },
  { key: "contactTime", unit: "s", sides: ["T", "CT"] },
  { key: "deathTime", unit: "s", sides: ["T", "CT"] },
  { key: "teamDistance", unit: "u", sides: ["T", "CT"] },
  { key: "awpShare", unit: "%", sides: ["T", "CT"] },
  { key: "siteShare", unit: "%", sides: ["CT"] },
];

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : null);

export function profileValues(p: SideProfile): Record<ProfileKey, number | null> {
  return {
    firstContact: pct(p.firstContacts, p.rounds),
    contactTime: p.contactTimeS,
    deathTime: p.deathTimeS,
    teamDistance: p.teamDistance,
    awpShare: pct(p.awpKills, p.kills),
    siteShare: pct(p.siteRounds, p.spotRounds),
  };
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Median of each profile value over several matches (nulls skipped). */
export function medianProfile(profiles: SideProfile[]): Record<ProfileKey, number | null> {
  const values = profiles.map(profileValues);
  const out = {} as Record<ProfileKey, number | null>;
  for (const f of PROFILE_FIELDS) {
    const xs = values.map((v) => v[f.key]).filter((x): x is number => x != null);
    const med = median(xs);
    out[f.key] = med == null ? null : f.unit === "s" ? Math.round(med * 10) / 10 : Math.round(med);
  }
  return out;
}

export function formatProfileValue(value: number | null, unit: string): string {
  if (value == null) return "–";
  if (unit === "u") return `${Math.round(value)} u`;
  if (unit === "s") return `${(Math.round(value * 10) / 10).toFixed(1)} s`;
  return `${Math.round(value)}${unit}`;
}

/** A stored profile (JSON) back to SideProfile, or null when it isn't one. */
export function asProfile(json: unknown): SideProfile | null {
  if (typeof json !== "object" || json === null) return null;
  const p = json as Partial<SideProfile>;
  if ((p.side !== "CT" && p.side !== "T") || typeof p.rounds !== "number" || !Array.isArray(p.spots)) return null;
  return p as SideProfile;
}

export const asRole = (x: unknown): Role | null => (isRole(x) ? x : null);

/** How often each role came up, most common first. */
export function roleCounts(roles: Array<Role | null>): Array<{ role: Role; n: number }> {
  const counts = new Map<Role, number>();
  for (const r of roles) if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts].map(([role, n]) => ({ role, n })).sort((a, b) => b.n - a.n);
}

/** The callouts a set of setup spots fall on, with their share (0–100), most used first. */
export function spotPlaces(
  spots: Array<[number, number, number]>,
  placeOf: ((p: { x: number; y: number; z: number }) => string | null) | null,
  max = 3
): Array<{ place: string; share: number }> {
  if (!placeOf || spots.length === 0) return [];
  const counts = new Map<string, number>();
  for (const [x, y, z] of spots) {
    const place = placeOf({ x, y, z });
    if (place) counts.set(place, (counts.get(place) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([place, n]) => ({ place, share: Math.round((n / spots.length) * 100) }));
}
