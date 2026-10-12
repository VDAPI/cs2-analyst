import type { Locale } from "./config";
import { pl } from "./messages/pl";
import { en } from "./messages/en";
import { fillVars, lookup, type Messages, type MessageKey, type TFunction, type TranslateVars } from "./format";

export type { Messages, MessageKey, TFunction, TranslateVars };

export const MESSAGES: Record<Locale, Messages> = { pl, en };

/** `{name}` placeholders are replaced from vars. Missing keys fall back to Polish, then the key. */
export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
  return fillVars(lookup(MESSAGES[locale], key) ?? lookup(MESSAGES.pl, key) ?? key, vars);
}

export function createT(locale: Locale): TFunction {
  return (key, vars) => translate(locale, key, vars);
}

/**
 * Plural form for a count. Polish: one / few (2–4, not 12–14) / many;
 * English: one / many (few is never used).
 */
export function pluralForm(locale: Locale, n: number): "one" | "few" | "many" {
  if (n === 1) return "one";
  if (locale === "en") return "many";
  const mod10 = n % 10;
  const mod100 = n % 100;
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "few" : "many";
}
