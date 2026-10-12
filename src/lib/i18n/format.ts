import type { pl } from "./messages/pl";

/**
 * Dictionary-free half of translate.ts: the client gets only its own
 * locale's messages from the root layout (S28) and formats with these.
 */

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

export function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** `{name}` placeholders are replaced from vars. */
export function fillVars(text: string, vars?: TranslateVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** A `t` over one dictionary; a missing key reads as the key itself. */
export function createTFromMessages(messages: Messages): TFunction {
  return (key, vars) => fillVars(lookup(messages, key) ?? key, vars);
}
