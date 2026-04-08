/**
 * Format a K/D ratio to 2 decimal places.
 */
export function formatKD(kills: number, deaths: number): string {
  if (deaths === 0) return kills.toFixed(1);
  return (kills / deaths).toFixed(2);
}

/**
 * Format HLTV 2.1 rating.
 */
export function formatRating(rating: number): string {
  return rating.toFixed(2);
}

/**
 * Format ADR (Average Damage per Round).
 */
export function formatADR(adr: number): string {
  return adr.toFixed(1);
}

/**
 * Format headshot percentage.
 */
export function formatHSPercent(percent: number): string {
  return `${(percent * 100).toFixed(0)}%`;
}

/**
 * Format money values ($4,750).
 */
export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

/**
 * Format match duration (MM:SS).
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format tick number to timestamp (MM:SS) given tick rate.
 */
export function tickToTime(tick: number, tickRate: number = 64): string {
  const seconds = Math.floor(tick / tickRate);
  return formatDuration(seconds);
}

/**
 * Determine buy type label from equipment value.
 */
export function getBuyTypeLabel(
  equipValue: number,
  isFirstRound: boolean
): string {
  if (isFirstRound) return "Pistol";
  if (equipValue >= 20000) return "Full Buy";
  if (equipValue >= 12000) return "Force Buy";
  if (equipValue >= 6000) return "Half Buy";
  return "Eco";
}

/**
 * Get color class for a stat relative to benchmarks.
 */
export function getStatColor(
  value: number,
  thresholds: { good: number; avg: number }
): string {
  if (value >= thresholds.good) return "text-[var(--success)]";
  if (value >= thresholds.avg) return "text-[var(--text-primary)]";
  return "text-[var(--error)]";
}

/**
 * Common stat benchmarks for contextual coloring.
 */
export const BENCHMARKS = {
  hltvRating: { good: 1.15, avg: 0.95 },
  adr: { good: 85, avg: 65 },
  kd: { good: 1.2, avg: 0.9 },
  hsPercent: { good: 0.55, avg: 0.40 },
} as const;

/**
 * Map name to display name.
 */
export function mapDisplayName(mapName: string): string {
  const names: Record<string, string> = {
    de_dust2: "Dust II",
    de_mirage: "Mirage",
    de_inferno: "Inferno",
    de_nuke: "Nuke",
    de_overpass: "Overpass",
    de_vertigo: "Vertigo",
    de_anubis: "Anubis",
    de_ancient: "Ancient",
    de_train: "Train",
  };
  return names[mapName] ?? mapName;
}

/**
 * Weapon display names.
 */
export function weaponDisplayName(weapon: string): string {
  const names: Record<string, string> = {
    ak47: "AK-47",
    m4a1: "M4A1-S",
    m4a1_silencer: "M4A1-S",
    m4a4: "M4A4",
    awp: "AWP",
    deagle: "Desert Eagle",
    usp_silencer: "USP-S",
    glock: "Glock-18",
    p250: "P250",
    famas: "FAMAS",
    galil: "Galil AR",
    sg556: "SG 553",
    aug: "AUG",
    ssg08: "SSG 08",
    mp9: "MP9",
    mac10: "MAC-10",
    knife: "Knife",
    hkp2000: "P2000",
    tec9: "Tec-9",
    cz75a: "CZ75-Auto",
    fiveseven: "Five-SeveN",
  };
  return names[weapon.toLowerCase()] ?? weapon;
}
