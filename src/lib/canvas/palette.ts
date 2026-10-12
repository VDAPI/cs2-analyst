/**
 * Canvas and SVG chart colors. Canvas 2D and SVG presentation attributes
 * can't read CSS custom properties, so these mirror the Violet Lime tokens in
 * `src/styles/globals.css` by value. Keep both in sync; components that render
 * DOM should keep using `var(--token)`.
 */
export const CANVAS_COLORS = {
  canvas: "#08070D",
  surface1: "#100E19",
  surface2: "#181528",
  textPrimary: "#F3F0FF",
  textTertiary: "#8A83A8",
  accent: "#9B6BFF",
  accent2: "#C6FF3D",
  ct: "#5AA9FF",
  t: "#FFC23D",
  mistake: "#FF4D6A",
  good: "#3DF5A0",
  warning: "#FFB020",
  deathGray: "#6E6890",
  grid: "rgba(190, 160, 255, 0.06)",
  axis: "rgba(190, 160, 255, 0.12)",
} as const;

export type GrenadeKind = "SMOKE" | "FLASH" | "HE" | "MOLOTOV" | "INCENDIARY" | "DECOY";

/** Utility colors (`--smoke`, `--flash`, `--he`, `--molotov`, `--decoy`) with Polish labels. */
export const GRENADE_STYLE: Record<GrenadeKind, { line: string; fill: string; label: string; token: string }> = {
  SMOKE: { line: "#A9A3C4", fill: "rgba(169,163,196,0.30)", label: "Smoke", token: "var(--smoke)" },
  FLASH: { line: "#FFF27A", fill: "rgba(255,242,122,0.25)", label: "Flash", token: "var(--flash)" },
  HE: { line: "#FF4D6A", fill: "rgba(255,77,106,0.25)", label: "HE", token: "var(--he)" },
  MOLOTOV: { line: "#FF7A33", fill: "rgba(255,122,51,0.25)", label: "Molotov", token: "var(--molotov)" },
  INCENDIARY: { line: "#FF7A33", fill: "rgba(255,122,51,0.25)", label: "Incendiary", token: "var(--molotov)" },
  DECOY: { line: "#9B6BFF", fill: "rgba(155,107,255,0.20)", label: "Decoy", token: "var(--decoy)" },
};

export function grenadeStyle(type: string) {
  return GRENADE_STYLE[type as GrenadeKind] ?? GRENADE_STYLE.DECOY;
}

/** Health bar color: good above 50, warning above 25, mistake below. */
export function healthColor(hp: number): string {
  return hp > 50 ? CANVAS_COLORS.good : hp > 25 ? CANVAS_COLORS.warning : CANVAS_COLORS.mistake;
}
