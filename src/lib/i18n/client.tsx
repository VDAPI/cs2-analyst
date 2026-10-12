"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { createTFromMessages, type Messages, type TFunction } from "./format";
import { pl } from "./messages/pl";

interface I18nValue {
  locale: Locale;
  messages: Messages;
}

const I18nContext = createContext<I18nValue>({ locale: DEFAULT_LOCALE, messages: pl });

/**
 * Set once in the root layout from the `locale` cookie. The client bundle
 * carries only the Polish dictionary (the default); any other locale's
 * messages come from the server as `messages` (S28), so nobody downloads a
 * dictionary they don't read.
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  /** The dictionary for `locale`; omit for Polish. */
  messages?: Messages;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, messages: messages ?? pl }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

export function useT(): TFunction {
  const { messages } = useContext(I18nContext);
  return useMemo(() => createTFromMessages(messages), [messages]);
}
