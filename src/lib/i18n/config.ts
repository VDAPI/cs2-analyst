/**
 * PL/EN (S18). Polish is the source language and the default; English is a
 * full copy of the same keys (`messages/en.ts` must type-check against
 * `messages/pl.ts`). The choice lives in the `locale` cookie and in
 * `User.locale` (push notifications are written in it).
 */
export const LOCALES = ["pl", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pl";
export const LOCALE_COOKIE = "locale";

/**
 * Pick English from the browser's Accept-Language when no choice was made.
 * Off while some screens are still Polish-only, so an English browser doesn't
 * get a half-translated app by default; the PL/EN switch always works.
 */
export const DETECT_BROWSER_LANGUAGE = false;

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Cookie first, then the browser's Accept-Language, then Polish. */
export function resolveLocale(
  cookieValue: string | undefined | null,
  acceptLanguage: string | undefined | null
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  if (acceptLanguage) {
    const langs = acceptLanguage
      .split(",")
      .map((part) => {
        const [tag, q] = part.trim().split(";q=");
        return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
      })
      .sort((a, b) => b.q - a.q);
    for (const { lang } of langs) if (isLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

/** BCP 47 tag for Intl formatters. */
export const INTL_LOCALE: Record<Locale, string> = { pl: "pl-PL", en: "en-GB" };
