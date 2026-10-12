import type { Locale } from "@/lib/i18n/config";

/** "−12,4" / "−12.4" (decimal mark of the locale, explicit sign; real minus sign). */
export function fmtPp(pp: number, locale: Locale): string {
  const n = new Intl.NumberFormat(locale === "en" ? "en-US" : "pl-PL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(pp));
  return `${pp > 0 ? "+" : pp < 0 ? "−" : ""}${n}`;
}

/** Magnitude only, for messages that carry their own sign ("kosztowało … {pp} pp"). */
export const fmtPpAbs = (pp: number, locale: Locale) => fmtPp(Math.abs(pp), locale);
