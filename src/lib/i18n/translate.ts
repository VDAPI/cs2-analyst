import type { Locale } from "./config";
import { pl } from "./messages/pl";
import { en } from "./messages/en";

/** Same shape as the Polish dictionary, any string values. */
export type Messages = DeepString<typeof pl>;
type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };

/** Every dotted path to a string in the dictionary, e.g. "nav.matches". */
export type MessageKey = Paths<typeof pl>;
type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslateVars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: TranslateVars) => string;

export const MESSAGES: Record<Locale, Messages> = { pl, en };

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** `{name}` placeholders are replaced from vars. Missing keys fall back to Polish, then the key. */
export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
  const text = lookup(MESSAGES[locale], key) ?? lookup(MESSAGES.pl, key) ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m
  );
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
