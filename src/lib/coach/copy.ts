/**
 * The finding catalog's copy in the reader's language: Polish from
 * src/lib/findings/catalog.ts, English from catalog-en.ts.
 */
import { categoryDef, findingDef, isFindingType } from "@/lib/findings/catalog";
import type { Locale } from "@/lib/i18n/config";
import { CATEGORIES_EN, FINDING_TYPES_EN, type FindingTypeCopy } from "./catalog-en";

export function findingCopy(type: string, locale: Locale): FindingTypeCopy {
  if (locale === "en" && isFindingType(type)) return FINDING_TYPES_EN[type];
  const d = findingDef(type);
  return { label: d.label, title: d.title, why: d.why, advice: d.advice, drill: d.drill, pro: d.pro };
}

export function categoryLabel(category: string, locale: Locale): string {
  if (locale === "en" && category in CATEGORIES_EN) return CATEGORIES_EN[category as keyof typeof CATEGORIES_EN].label;
  return categoryDef(category).label;
}
