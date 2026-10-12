"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { createT, type TFunction } from "./translate";

const I18nContext = createContext<Locale>(DEFAULT_LOCALE);

/** Set once in the root layout from the `locale` cookie. */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext);
}

export function useT(): TFunction {
  const locale = useLocale();
  return useMemo(() => createT(locale), [locale]);
}
