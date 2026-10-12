/**
 * "No invented facts" check for the AI coach (S15). Every number the AI
 * writes must appear in the facts it was given (as a number or inside a fact
 * string, or as that number rounded); small counts (0–10) and the digits in
 * weapon names are allowed. A text that fails is replaced by the standard
 * text for that item, so the player never sees a number the analysis didn't
 * produce. Pure, covered by `npm run test:coach`.
 */

const NUMBER = /\d+(?:[.,]\d+)?/g;

/** Weapon and game names carry digits that are not facts ("AK-47", "CS2"). */
const NAMES =
  /\b(?:AK-47|M4A1-S|M4A1|M4A4|MP9|MP7|MP5-SD|P250|P2000|P90|UMP-45|SSG\s?08|G3SG1|SCAR-20|MAG-7|XM1014|MAC-10|Tec-9|CZ75(?:-Auto)?|R8|Glock-18|USP-S|SG\s?553|M249|CS2|CS:GO|1v1|1v2|1v3|1v4|1v5|2v1|2v2|3v1)\b/gi;

export function normalizeNumber(raw: string): string {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? String(n) : raw;
}

/** Numbers written in a text, normalised ("0,6" → "0.6", "07" → "7"). */
export function numbersIn(text: string): string[] {
  return (text.replace(NAMES, " ").match(NUMBER) ?? []).map(normalizeNumber);
}

function addNumber(set: Set<string>, n: number) {
  if (!Number.isFinite(n)) return;
  const abs = Math.abs(n);
  set.add(String(abs));
  set.add(String(Math.round(abs)));
  set.add(String(Math.round(abs * 10) / 10));
}

/** Every number the facts contain, with rounded variants, plus 0–10. */
export function factNumbers(facts: unknown): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= 10; i++) out.add(String(i));
  const walk = (v: unknown) => {
    if (typeof v === "number") addNumber(out, v);
    else if (typeof v === "string") for (const n of numbersIn(v)) addNumber(out, Number(n));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(facts);
  return out;
}

/** Numbers in `text` that the facts don't back. */
export function ungroundedNumbers(text: string, allowed: Set<string>): string[] {
  return numbersIn(text).filter((n) => !allowed.has(n));
}

export function isGrounded(texts: string[], allowed: Set<string>): boolean {
  return texts.every((t) => ungroundedNumbers(t, allowed).length === 0);
}
