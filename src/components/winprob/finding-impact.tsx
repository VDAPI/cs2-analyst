"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/client";
import { fmtPp, fmtPpAbs } from "@/lib/winprob/format";
import type { MessageKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils/cn";

/** Smaller changes are noise next to the model's own error; not worth a line. */
export const MIN_IMPACT_PP = 0.5;

export const ppOf = (wp: { before: number; after: number }) => Math.round((wp.after - wp.before) * 1000) / 10;

/** "Kosztowało team −14 pp szansy na rundę (54% → 40%, śmierć po tym błędzie)" on a finding card. */
export function FindingImpact({ wp }: { wp: { before: number; after: number; kind: string } }) {
  const t = useT();
  const locale = useLocale();
  const pp = ppOf(wp);
  if (Math.abs(pp) < MIN_IMPACT_PP) return null;
  const cost = pp < 0;
  const Icon = cost ? TrendingDown : TrendingUp;
  const kindKey = `winprob.kind.${wp.kind}` as MessageKey;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
        cost
          ? "border-[var(--mistake-muted)] bg-[var(--mistake-muted)]"
          : "border-[var(--good-muted)] bg-[var(--good-muted)]"
      )}
    >
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", cost ? "text-[var(--mistake)]" : "text-[var(--good)]")} aria-hidden />
      <span className="min-w-0">
        <span className="font-semibold text-[var(--text-primary)]">
          {cost
            ? t("winprob.costLong", { pp: fmtPp(pp, locale) })
            : t("winprob.gainLong", { pp: fmtPpAbs(pp, locale) })}
        </span>
        <span className="text-[var(--text-tertiary)]">
          {" "}
          (
          <span className="font-mono">
            {t("winprob.beforeAfter", { before: Math.round(wp.before * 100), after: Math.round(wp.after * 100) })}
          </span>
          , {t(kindKey)})
        </span>
      </span>
    </p>
  );
}
