import { cookies, headers } from "next/headers";
import { DETECT_BROWSER_LANGUAGE, LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { createT, type TFunction } from "./translate";

/** The viewer's language in a Server Component or Route Handler. */
export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    DETECT_BROWSER_LANGUAGE ? headerStore.get("accept-language") : null
  );
}

export async function getT(): Promise<{ t: TFunction; locale: Locale }> {
  const locale = await getLocale();
  return { t: createT(locale), locale };
}
