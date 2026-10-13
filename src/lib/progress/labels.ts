import type { MessageKey, TFunction } from "@/lib/i18n/translate";

/**
 * Display name of a progress metric. Lives apart from the trend chart so
 * screens that only need the name (coach plan, goals) don't load Recharts (S28).
 */
export const metricLabel = (t: TFunction, key: string) => t(`progressMetrics.${key}` as MessageKey);
