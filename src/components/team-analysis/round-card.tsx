import Link from "next/link";
import { Play } from "lucide-react";
import { Badge } from "@/components/ui";
import type { TFunction } from "@/lib/i18n/translate";
import type { RoundBreakdown } from "@/lib/team/antistrat";
import { BUY_KEY, roundText, thrownText, type NameOf } from "@/lib/team/breakdown-text";
import { cn } from "@/lib/utils/cn";

export function SideBadge({ side }: { side: "CT" | "T" }) {
  return <span className={cn("font-mono text-xs font-semibold", side === "CT" ? "text-[var(--ct-blue)]" : "text-[var(--t-gold)]")}>{side}</span>;
}

/** One round of a team breakdown: buy, result, the play (who went where), grenades, 2D replay link. */
export function RoundCard({ r, t, map, nameOf }: { r: RoundBreakdown; t: TFunction; map: string; nameOf: NameOf }) {
  const text = roundText(t, map, r, nameOf);
  return (
    <li className="space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[var(--text-primary)]">R{r.round}</span>
        <SideBadge side={r.side} />
        <Badge variant="neutral">{t(BUY_KEY[r.buy])}</Badge>
        <span className={r.won ? "text-[var(--good)]" : "text-[var(--mistake)]"}>{r.won ? t("teamDemo.won") : t("teamDemo.lost")}</span>
        <Link
          href={`/replay/${r.matchId}?round=${r.round}&tick=${r.tick}`}
          title={t("antistrat.openRound")}
          className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 font-mono text-xs text-[var(--accent-hover)] hover:border-[var(--border-hover)] print:hidden"
        >
          <Play className="h-3 w-3" aria-hidden />
          2D
        </Link>
      </p>
      <p className="font-display text-base font-semibold text-[var(--text-primary)]">{text.name}</p>
      <ul className="space-y-0.5 text-[var(--text-secondary)]">
        {text.groups.map((g, n) => (
          <li key={n}>{g}</li>
        ))}
      </ul>
      {text.outcome && <p className="text-[var(--text-secondary)]">{text.outcome}</p>}
      <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">{thrownText(t, map, r, nameOf)}</p>
    </li>
  );
}
