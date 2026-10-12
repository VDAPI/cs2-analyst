/** Formatting for progress values; tiny and dependency-free so client charts can import it. */
export function formatProgressValue(def: { unit: string; decimals: number }, v: number | null): string {
  if (v == null) return "–";
  const n = v.toFixed(def.decimals);
  if (def.unit === "") return n;
  return def.unit === "%" || def.unit === "°" ? `${n}${def.unit}` : `${n} ${def.unit}`;
}

/** "+3", "−0.12 ms" — a signed change with the metric's unit. */
export function formatDelta(def: { unit: string; decimals: number }, d: number): string {
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  return `${sign}${formatProgressValue(def, Math.abs(d))}`;
}
