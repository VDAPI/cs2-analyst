/**
 * Norms as the report and the /pro screen show them (S13). Pure.
 */
import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import { formatMetric, type ReportMetric } from "@/lib/findings/report";
import {
  betterThan,
  METRIC_DIRECTION,
  parseRankBucket,
  perMatchCount,
  PREMIER_BUCKET,
  proNorm,
  SKILL_GROUPS,
  usable,
  verdictVs,
  type NormContext,
  type NormRow,
  type NormTable,
  type ProNorm,
  type Situation,
} from "./norms";

/** Unit of every norm metric (same as its ReportMetric). */
export const METRIC_UNIT: Record<string, string> = {
  moving_first: "%", strafe: "ms", first_bullet: "%", hs: "%", spray: "%",
  crosshair: "°", reaction: "ms", ttd: "ms", preaim: "%", overflick: "%",
  dry_peek: "%", opening: "%", reload: "",
  noise: "", jump: "",
  flash_blind: "s", team_flash: "s", flash_follow: "%", smoke_wasted: "%",
  he_damage: "HP", molotov_damage: "HP", unused_utility: "$",
  traded_deaths: "%", trades: "%",
  bad_force: "",
  same_spot: "%",
};

/** The /pro screen's sections, in report category order. */
export const METRIC_GROUPS: Array<{ category: string; metrics: string[] }> = [
  { category: "shooting", metrics: ["moving_first", "strafe", "first_bullet", "hs", "spray"] },
  { category: "aim", metrics: ["crosshair", "reaction", "ttd", "preaim", "overflick"] },
  { category: "duels", metrics: ["dry_peek", "opening", "reload"] },
  { category: "sound", metrics: ["noise", "jump"] },
  { category: "utility", metrics: ["flash_blind", "team_flash", "flash_follow", "smoke_wasted", "he_damage", "molotov_damage", "unused_utility"] },
  { category: "teamplay", metrics: ["traded_deaths", "trades"] },
  { category: "economy", metrics: ["bad_force"] },
  { category: "positioning", metrics: ["same_spot"] },
];

export const SITUATION_KEY: Record<Situation, MessageKey> = {
  all: "norms.situationAll",
  rifle: "norms.situationRifle",
  awp: "norms.situationAwp",
  smg: "norms.situationSmg",
  pistol: "norms.situationPistol",
};

/** Norm values print like the metric itself: one decimal for seconds, degrees and counts, whole numbers otherwise. */
export function formatNormValue(value: number | null, unit: string): string {
  if (value == null || !Number.isFinite(value)) return "–";
  const shown = unit === "s" || unit === "°" || unit === "" ? Math.round(value * 10) / 10 : Math.round(value);
  return formatMetric({ value: shown, unit });
}

export function rankLabel(t: TFunction, bucket: string | null): string {
  if (!bucket || bucket === "all") return t("norms.rankAll");
  const r = parseRankBucket(bucket);
  if (!r) return bucket;
  if (r.type === "faceit") return t("norms.rankFaceit", { value: r.value });
  if (r.type === "competitive") return t("norms.rankCompetitive", { name: SKILL_GROUPS[r.value - 1] ?? String(r.value) });
  const from = r.value.toLocaleString("pl-PL");
  return r.value >= 30000
    ? t("norms.rankPremierTop", { from })
    : t("norms.rankPremier", { from, to: (r.value + PREMIER_BUCKET - 1).toLocaleString("pl-PL") });
}

export interface MetricComparison {
  key: string;
  pro: ProNorm | null;
  /** Median of the player's rank pool (or every player, when the rank is unknown). */
  rank: NormRow | null;
  /** 0–100, only against measured pro norms. */
  betterThanPro: number | null;
  verdict: "better" | "within" | "worse" | null;
}

/**
 * A report metric against the pro norm and the rank pool. Counts are put on
 * the norms' per-24-rounds scale first (`rounds` = rounds the player played);
 * a rate over too few samples gets the norms but no standing or verdict.
 */
export function compareMetric(
  metric: Pick<ReportMetric, "key" | "value" | "unit" | "samples">,
  table: NormTable | null,
  ctx: NormContext,
  rankPool: string | null,
  rounds = 0
): MetricComparison {
  const direction = METRIC_DIRECTION[metric.key];
  const pro = direction ? proNorm(table, metric.key, ctx) : null;
  const rank = direction && table ? table.get(rankPool ?? "all", metric.key, ctx) : null;
  const value =
    metric.unit === "" ? perMatchCount(metric.value, rounds) : usable(metric.unit, metric.value, metric.samples) ? metric.value : null;
  return {
    key: metric.key,
    pro,
    rank,
    betterThanPro: pro && direction ? betterThan(value, pro, direction) : null,
    verdict: pro && direction ? verdictVs(value, pro, direction) : null,
  };
}

/** "pro: 7%" or "pro: ≈7%" for reference values. */
export function proText(pro: ProNorm | null, unit: string): string | null {
  if (!pro) return null;
  return `pro: ${pro.source === "reference" ? "≈" : ""}${formatNormValue(pro.p50, unit)}`;
}
