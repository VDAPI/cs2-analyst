/**
 * Roles corrected by hand (S31). Detection (roles.ts) can be wrong, and on
 * FACEIT many players keep one role, so the uploader can correct a player's
 * role per match and side, and remember it as their usual role. The role the
 * report and the role-aware findings use is, in order: the match's
 * correction, the uploader's usual role for that SteamID, the detected role.
 *
 * Pure module (the DB side is in persist.ts), covered by `npm run test:roles`.
 */
import { roundSides, type TacticsInput } from "@/lib/analysis/tactics";
import { isRole, matchRole, SIDE_ROLES, type PlayerRoles, type Role } from "./roles";

export type RoleSide = "T" | "CT";

export interface RoleCorrection {
  steamId: string;
  side: RoleSide;
  role: Role;
}

/** One player's usual roles. */
export interface UsualRoles {
  T?: Role;
  CT?: Role;
}

/** User.roleDefaults: the uploader's usual roles per SteamID (their own, or teammates they correct). */
export type RoleDefaults = Record<string, UsualRoles>;

/** At most this many players' usual roles are kept per user. */
export const MAX_ROLE_DEFAULTS = 30;

export interface EffectiveRoles {
  /** Role per side after corrections (null = none detected and none set). */
  sides: Record<RoleSide, Role | null>;
  /** Role per side as detected. */
  detected: Record<RoleSide, Role | null>;
  /** Which sides were set by hand ("match" = this match, "default" = the usual role). */
  source: Record<RoleSide, "match" | "default" | null>;
  /** The match role from the corrected sides. */
  role: Role | null;
}

/** A role that is valid for the side (AWP on both, entry/lurk only T, anchor/rotator/mid only CT). */
export function isSideRole(side: RoleSide, role: unknown): role is Role {
  return isRole(role) && SIDE_ROLES[side].includes(role);
}

/** User.roleDefaults JSON back to RoleDefaults, dropping anything invalid (null when empty). */
export function asRoleDefaults(json: unknown): RoleDefaults | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const out: RoleDefaults = {};
  for (const [steamId, value] of Object.entries(json as Record<string, unknown>)) {
    if (!/^\d{1,20}$/.test(steamId) || typeof value !== "object" || value === null) continue;
    const v = value as Record<string, unknown>;
    const usual: UsualRoles = {};
    if (isSideRole("T", v.T)) usual.T = v.T;
    if (isSideRole("CT", v.CT)) usual.CT = v.CT;
    if (usual.T || usual.CT) out[steamId] = usual;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Set or clear one side of a player's usual roles (null when nothing is left). */
export function updateRoleDefaults(
  current: RoleDefaults | null,
  steamId: string,
  side: RoleSide,
  role: Role | null
): RoleDefaults | null {
  const next: RoleDefaults = { ...(current ?? {}) };
  const usual: UsualRoles = { ...(next[steamId] ?? {}) };
  if (role) usual[side] = role;
  else delete usual[side];
  delete next[steamId];
  // Re-inserted last: the oldest players go first when over the cap.
  if (usual.T || usual.CT) next[steamId] = usual;
  const ids = Object.keys(next);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_ROLE_DEFAULTS))) delete next[id];
  return Object.keys(next).length > 0 ? next : null;
}

/** Corrections for every player of a match: the match's own first, then the uploader's usual roles. */
export function effectiveRoles(
  detected: Pick<PlayerRoles, "steamId" | "sides">[],
  corrections: RoleCorrection[],
  defaults: RoleDefaults | null
): Map<string, EffectiveRoles> {
  const out = new Map<string, EffectiveRoles>();
  const ids = new Set([...detected.map((d) => d.steamId), ...corrections.map((c) => c.steamId)]);
  for (const id of ids) {
    const d = detected.find((x) => x.steamId === id);
    const det: Record<RoleSide, Role | null> = { T: d?.sides.T?.role ?? null, CT: d?.sides.CT?.role ?? null };
    out.set(id, resolve(id, det, corrections, defaults));
  }
  return out;
}

/** One player's effective roles from the detected side roles. */
export function resolve(
  steamId: string,
  detected: Record<RoleSide, Role | null>,
  corrections: RoleCorrection[],
  defaults: RoleDefaults | null
): EffectiveRoles {
  const sides = { ...detected };
  const source: EffectiveRoles["source"] = { T: null, CT: null };
  for (const side of ["T", "CT"] as RoleSide[]) {
    const own = corrections.find((c) => c.steamId === steamId && c.side === side && isSideRole(side, c.role));
    const usual = defaults?.[steamId]?.[side];
    if (own) {
      sides[side] = own.role;
      source[side] = "match";
    } else if (usual) {
      sides[side] = usual;
      source[side] = "default";
    }
  }
  return {
    sides,
    detected,
    source,
    role: matchRole({ T: { role: sides.T }, CT: { role: sides.CT } }),
  };
}

/** A player's role in one round (the side they played that round), for the role-aware findings. */
export type RoleOf = (steamId: string, roundNumber: number) => Role | null;

export function roleOfRound(input: TacticsInput, roles: Map<string, EffectiveRoles>): RoleOf {
  const finalSide = new Map(input.players.map((p) => [p.steamId, p.team]));
  const totalRounds = input.totalRounds ?? Math.max(0, ...input.rounds.map((r) => r.number));
  const sidesBy = new Map(input.rounds.map((r) => [r.number, roundSides(r, finalSide, totalRounds)]));
  return (steamId, roundNumber) => {
    const side = sidesBy.get(roundNumber)?.get(steamId);
    return side ? (roles.get(steamId)?.sides[side] ?? null) : null;
  };
}
