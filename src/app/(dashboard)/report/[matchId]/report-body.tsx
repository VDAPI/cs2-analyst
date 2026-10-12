import Link from "next/link";
import { CheckCircle2, Dumbbell, Lightbulb, Play, Sparkles, Trophy } from "lucide-react";
import { Card, FindingTag, LazyDetails, SectionTitle, buttonVariants } from "@/components/ui";
import { LazyFindingClip } from "@/components/replay/finding-clip-lazy";
import { cn } from "@/lib/utils/cn";
import { formatMetric, type PlayerReport, type ReportIssue, type ReportMetric } from "@/lib/findings/report";
import { fmtRoundTime, replayHref, type FindingView } from "@/lib/findings/view";
import type { ReportNorms } from "@/lib/norms/report-norms";
import { formatNormValue, proText } from "@/lib/norms/view";
import { totalCostPp, type ReportWinProb } from "@/lib/winprob/report";
import { FindingCard, type ClipContext } from "./finding-card";

const STATUS_TONE: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warning)]",
  bad: "text-[var(--mistake)]",
  none: "text-[var(--text-secondary)]",
};

/**
 * The report itself: summary, top 3, strengths and every issue by category.
 * Rendered by the report page and, read-only (`ctx.share`), by a public
 * report link (S16).
 */
export function ReportBody({
  report,
  ctx,
  nameOf,
  norms = null,
  normsHref = null,
  winprob = null,
}: {
  report: PlayerReport<FindingView>;
  ctx: ClipContext;
  nameOf: Map<string, string>;
  /** Pro and rank norms (S13); without them the report shows the catalog's reference pro text. */
  norms?: ReportNorms | null;
  /** Link to the full norms screen (logged-in report only). */
  normsHref?: string | null;
  /** Round win probability (S14): WPA and the model behind the "pp" numbers. */
  winprob?: ReportWinProb | null;
}) {
  const totalCost = winprob ? totalCostPp(report.issues.flatMap((i) => i.findings)) : null;
  const wpTiles = winprob ? (totalCost != null ? 1 : 0) + (winprob.wpaPerRoundPp != null ? 1 : 0) : 0;
  return (
    <>
      {/* Summary */}
      <div className={cn("grid grid-cols-2 gap-3", wpTiles > 0 ? "sm:grid-cols-3 lg:grid-cols-6" : "lg:grid-cols-4")}>
        <SummaryTile label="Wykryte błędy" value={report.totals.findings} />
        <SummaryTile label="Poważne" value={report.totals.high} tone="text-[var(--mistake)]" />
        <SummaryTile label="Kosztowały walkę" value={report.totals.costly} tone="text-[var(--warning)]" />
        <SummaryTile label="Rundy z błędem" value={report.totals.rounds} />
        {winprob && totalCost != null && (
          <SummaryTile
            label={winprob.t("winprob.summaryCost")}
            title={winprob.t("winprob.summaryCostHint")}
            value={`${winprob.fmt(totalCost)} pp`}
            tone="text-[var(--mistake)]"
          />
        )}
        {winprob && winprob.wpaPerRoundPp != null && (
          <SummaryTile
            label={winprob.t("winprob.wpa")}
            title={winprob.t("winprob.wpaHint")}
            value={winprob.t("winprob.wpaValue", { pp: winprob.fmt(winprob.wpaPerRoundPp) })}
            tone={winprob.wpaPerRoundPp >= 0 ? "text-[var(--good)]" : "text-[var(--mistake)]"}
          />
        )}
      </div>

      {/* Top 3 */}
      <section aria-labelledby="top3" className="space-y-4">
        <SectionTitle>
          <span id="top3">Top {Math.max(report.top.length, 1)} do poprawy</span>
        </SectionTitle>
        {report.top.length === 0 ? (
          <Card className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <Trophy className="h-5 w-5 shrink-0 text-[var(--accent-2)]" aria-hidden />
            Nic poważnego do poprawy w tym meczu. Sprawdź listę niżej, tam są drobne wskazówki.
          </Card>
        ) : (
          report.top.map((issue, i) => (
            <TopIssue key={issue.type} rank={i + 1} issue={issue} ctx={ctx} nameOf={nameOf} norms={norms} winprob={winprob} />
          ))
        )}
      </section>

      {/* Strengths */}
      {report.strengths.length > 0 && (
        <section aria-labelledby="mocne" className="space-y-3">
          <SectionTitle>
            <span id="mocne">Co idzie dobrze</span>
          </SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {report.strengths.map((m) => (
              <div
                key={m.key}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"
              >
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--good)]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--text-primary)]">{m.label}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    próg {m.threshold}
                    {proText(norms?.cmpOf.get(m.key)?.pro ?? null, m.unit) && (
                      <> · {proText(norms?.cmpOf.get(m.key)?.pro ?? null, m.unit)}</>
                    )}
                  </p>
                </div>
                <span className="font-mono text-lg font-semibold text-[var(--good)]">{formatMetric(m)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Every metric against pros and the player's rank (S13) */}
      {norms && norms.metrics.length > 0 && (
        <section aria-labelledby="vs-pro" className="space-y-3">
          <SectionTitle>
            <span id="vs-pro">{norms.t("norms.reportTitle")}</span>
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            {norms.t("norms.reportHint")}
            {normsHref && (
              <>
                {" "}
                <Link href={normsHref} className="text-[var(--accent-hover)] underline-offset-2 hover:underline">
                  {norms.t("norms.title")} →
                </Link>
              </>
            )}
          </p>
          <VsProTable norms={norms} />
        </section>
      )}

      {/* Everything, by category */}
      <section aria-labelledby="wszystko" className="space-y-6">
        <SectionTitle>
          <span id="wszystko">Wszystko według kategorii</span>
        </SectionTitle>
        {report.byCategory.map(({ category, issues }) => (
          <div key={category.key} className="space-y-2">
            <div>
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{category.label}</h3>
              <p className="text-xs text-[var(--text-tertiary)]">{category.description}</p>
            </div>
            {issues.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-tertiary)]">
                {category.plannedIn
                  ? "Wkrótce: ta analiza jest w przygotowaniu."
                  : "Brak błędów w tej kategorii."}
              </p>
            ) : (
              issues.map((issue) => (
                <IssueDetails key={issue.type} issue={issue} ctx={ctx} nameOf={nameOf} norms={norms} winprob={winprob} />
              ))
            )}
          </div>
        ))}
      </section>

      <p className="text-xs text-[var(--text-tertiary)]">
        Błędy oceniamy po tym, co mogłeś wiedzieć w danej chwili (widoczność z gry, dźwięk, info od teamu), a nie
        po widoku z góry. {norms?.anyMeasured && norms.t("norms.reportFootMeasured")}{" "}
        {(!norms || norms.anyReference) && "Wartości „pro” oznaczone ≈ są orientacyjne, z publicznych źródeł, do czasu zebrania dem pro."}{" "}
        Kolejność top 3 bierze pod uwagę liczbę i wagę błędów,
        to, czy kosztowały walkę, oraz wynik metryki w całym meczu.
        {winprob && (
          <>
            {" "}
            {winprob.t("winprob.foot", {
              model: winprob.trained
                ? winprob.t("winprob.footTrained", { n: winprob.nMatches })
                : winprob.t("winprob.footPrior"),
            })}
          </>
        )}
      </p>
    </>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: number | string;
  tone?: string;
  title?: string;
}) {
  return (
    <Card className="p-4 md:p-4" title={title}>
      <p className="label-overline truncate text-[var(--text-tertiary)]">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-semibold tabular-nums", tone ?? "text-[var(--text-primary)]")}>
        {value}
      </p>
    </Card>
  );
}

const VERDICT_TONE: Record<string, string> = {
  better: "text-[var(--good)]",
  within: "text-[var(--text-secondary)]",
  worse: "text-[var(--mistake)]",
};

/** "· pro: 24% · Poziom FACEIT 7: 18%" next to a metric. */
function NormLine({ metric, norms }: { metric: ReportMetric; norms: ReportNorms | null }) {
  const cmp = norms?.cmpOf.get(metric.key);
  if (!norms || (!cmp?.pro && !cmp?.rank)) return null;
  return (
    <span className="text-[var(--text-tertiary)]">
      {cmp.pro && (
        <>
          {" · "}
          <span
            className="font-medium text-[var(--accent-2)]"
            title={cmp.pro.source === "reference" ? norms.t("norms.approx") : norms.t("norms.proN", { n: cmp.pro.n })}
          >
            {proText(cmp.pro, metric.unit)}
          </span>
        </>
      )}
      {cmp.rank && (
        <>
          {" · "}
          {norms.rankName}: <span className="font-mono">{formatNormValue(cmp.rank.p50, metric.unit)}</span>
        </>
      )}
    </span>
  );
}

/** Pro text for an issue: the measured norm of its metric when there is one, else the catalog's reference line. */
function issueProText(issue: ReportIssue<FindingView>, norms: ReportNorms | null): string {
  const cmp = issue.metric ? norms?.cmpOf.get(issue.metric.key) : undefined;
  if (norms && issue.metric && cmp?.pro?.source === "pro") {
    const range = `${formatNormValue(cmp.pro.p25, issue.metric.unit)}–${formatNormValue(cmp.pro.p75, issue.metric.unit)}`;
    return `${proText(cmp.pro, issue.metric.unit)} (p25–p75 ${range}, ${norms.t("norms.proN", { n: cmp.pro.n })})`;
  }
  return issue.def.pro;
}

/** Every number of the match next to the pro median and the rank pool's median. */
function VsProTable({ norms }: { norms: ReportNorms }) {
  const { t } = norms;
  return (
    <div className="table-scroll rounded-xl border border-[var(--border)]">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("norms.colMetric")}</th>
            <th className="text-right">{t("norms.colYou")}</th>
            <th className="text-right">{t("norms.colPro")}</th>
            <th className="text-right">{norms.rankName}</th>
            <th className="text-right">{t("norms.colStanding")}</th>
          </tr>
        </thead>
        <tbody>
          {norms.metrics.map((m) => {
            const cmp = norms.cmpOf.get(m.key);
            return (
              <tr key={m.key}>
                <td className="min-w-[120px] max-w-[150px] whitespace-normal sm:max-w-[260px]">{m.label}</td>
                <td className={cn("text-right font-mono font-semibold", STATUS_TONE[m.status])}>{formatMetric(m)}</td>
                <td className="text-right font-mono text-[var(--accent-2)]">
                  {cmp?.pro ? `${cmp.pro.source === "reference" ? "≈" : ""}${formatNormValue(cmp.pro.p50, m.unit)}` : "–"}
                </td>
                <td className="text-right font-mono text-[var(--text-secondary)]">
                  {cmp?.rank ? formatNormValue(cmp.rank.p50, m.unit) : "–"}
                </td>
                <td className={cn("text-right text-xs", cmp?.verdict ? VERDICT_TONE[cmp.verdict] : "text-[var(--text-tertiary)]")}>
                  {cmp?.betterThanPro != null
                    ? t("norms.betterThan", { pct: cmp.betterThanPro })
                    : cmp?.verdict === "better"
                      ? t("norms.verdictBetter")
                      : cmp?.verdict === "within"
                        ? t("norms.verdictWithin")
                        : cmp?.verdict === "worse"
                          ? t("norms.verdictWorse")
                          : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetricLine({ metric, norms }: { metric: ReportMetric; norms: ReportNorms | null }) {
  return (
    <p className="text-sm text-[var(--text-secondary)]">
      {metric.label}:{" "}
      <span className={cn("font-mono font-semibold", STATUS_TONE[metric.status])}>{formatMetric(metric)}</span>
      <NormLine metric={metric} norms={norms} />
      <span className="text-[var(--text-tertiary)]">
        {" "}
        · próg {metric.threshold} · próbka{" "}
        <span className="font-mono">{metric.samples}</span>
      </span>
    </p>
  );
}

function issueCountLabel(issue: ReportIssue<FindingView>): string {
  const n = issue.findings.length;
  if (n === 0) return "metryka meczu";
  const word = n === 1 ? "moment" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "momenty" : "momentów";
  return `${n} ${word}${issue.costly > 0 ? `, ${issue.costly} kosztowało walkę` : ""}`;
}

function TopIssue({
  rank,
  issue,
  ctx,
  nameOf,
  norms,
  winprob,
}: {
  rank: number;
  issue: ReportIssue<FindingView>;
  ctx: ClipContext;
  nameOf: Map<string, string>;
  norms: ReportNorms | null;
  winprob: ReportWinProb | null;
}) {
  const worst = issue.findings[0];
  const cost = winprob ? totalCostPp(issue.findings) : null;
  return (
    <Card className="grid gap-4 border-l-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]" style={{ borderLeftColor: rank === 1 ? "var(--accent-2)" : "var(--accent)" }}>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-display text-base font-bold",
              rank === 1 ? "bg-[var(--accent-2)] text-[var(--on-accent)]" : "bg-[var(--accent-muted)] text-[var(--accent-hover)]"
            )}
          >
            {rank}
          </span>
          <h3 className="min-w-0 flex-1 font-display text-lg font-semibold text-[var(--text-primary)]">{issue.def.title}</h3>
          <FindingTag severity={issue.severity} />
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">
          {issue.def.label} · {issueCountLabel(issue)}
          {winprob && cost != null && (
            <>
              {" · "}
              <span className="font-mono font-semibold text-[var(--mistake)]" title={winprob.t("winprob.summaryCostHint")}>
                {winprob.t("winprob.issueCost", { pp: winprob.fmt(cost) })}
              </span>
            </>
          )}
        </p>
        {issue.metric && <MetricLine metric={issue.metric} norms={norms} />}
        <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-2)]" aria-hidden />
          <span>
            <span className="font-medium text-[var(--accent-2)]">{issueProText(issue, norms)}</span>
            <span className="text-[var(--text-tertiary)]"> · {issue.def.why}</span>
          </span>
        </p>
        <div className="rounded-lg bg-[var(--accent-muted)] p-3">
          <p className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-hover)]" aria-hidden />
            <span>
              <span className="font-semibold">Rada: </span>
              {issue.def.advice}
            </span>
          </p>
          <p className="mt-2 flex items-start gap-2 text-xs text-[var(--text-secondary)]">
            <Dumbbell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-hover)]" aria-hidden />
            <span>
              <span className="font-semibold">Ćwiczenie: </span>
              {issue.def.drill}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {worst && !ctx.share && (
            <Link href={replayHref(ctx.matchId, worst)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <Play className="h-3.5 w-3.5" aria-hidden />
              Najgorszy moment w replayu
            </Link>
          )}
          {issue.findings.length > 1 && (
            <a href={`#issue-${issue.type}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Wszystkie momenty ({issue.findings.length})
            </a>
          )}
        </div>
      </div>
      {worst ? (
        <div className="min-w-0 space-y-1.5">
          {/* Keyed by the moment: switching player keeps TopIssue (same type) but must reload the clip. */}
          <LazyFindingClip
            key={worst.id}
            matchId={ctx.matchId}
            mapName={ctx.mapName}
            mapConfig={ctx.mapConfig}
            roundNumber={worst.roundNumber}
            tick={worst.tick}
            steamId={worst.steamId}
            targetSteamId={worst.targetSteamId}
            severity={worst.severity}
            clip={issue.def.clip}
            share={ctx.share}
            autoLoad
            label={`${issue.def.label}, runda ${worst.roundNumber}`}
          />
          <p className="text-xs text-[var(--text-tertiary)]">
            <span className="font-mono text-[var(--text-secondary)]">
              R{worst.roundNumber} · {fmtRoundTime(worst.roundTime)}
            </span>{" "}
            · {worst.detail}
            {worst.targetSteamId && nameOf.get(worst.targetSteamId) && <> · przeciwko {nameOf.get(worst.targetSteamId)}</>}
          </p>
        </div>
      ) : (
        <div className="flex items-center rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-tertiary)]">
          To wynik z całego meczu, bez jednego momentu do pokazania. {issue.metric?.hint}
        </div>
      )}
    </Card>
  );
}

function IssueDetails({
  issue,
  ctx,
  nameOf,
  norms,
  winprob,
}: {
  issue: ReportIssue<FindingView>;
  ctx: ClipContext;
  nameOf: Map<string, string>;
  norms: ReportNorms | null;
  winprob: ReportWinProb | null;
}) {
  const cost = winprob ? totalCostPp(issue.findings) : null;
  return (
    <LazyDetails
      id={`issue-${issue.type}`}
      className="group scroll-mt-20 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] open:border-[var(--border-hover)]"
      summary={
        <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:px-4 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">{issue.def.title}</span>
          {issue.metric && issue.metric.value != null && (
            <span className={cn("font-mono text-sm font-semibold", STATUS_TONE[issue.metric.status])}>
              {formatMetric(issue.metric)}
            </span>
          )}
          {cost != null && winprob && (
            <span className="font-mono text-xs font-semibold text-[var(--mistake)]" title={winprob?.t("winprob.summaryCostHint")}>
              {winprob.fmt(cost)} pp
            </span>
          )}
          <span className="font-mono text-xs text-[var(--text-tertiary)]">{issue.findings.length}×</span>
          {issue.metric?.status === "good" ? (
            <FindingTag severity="good">Dobrze</FindingTag>
          ) : (
            <FindingTag severity={issue.severity} />
          )}
        </summary>
      }
    >
      <div className="space-y-3 border-t border-[var(--border)] px-3 py-3 sm:px-4">
        {issue.metric && <MetricLine metric={issue.metric} norms={norms} />}
        <p className="text-sm text-[var(--text-secondary)]">{issue.def.why}</p>
        <p className="text-sm text-[var(--text-primary)]">
          <span className="font-semibold text-[var(--accent-hover)]">Rada: </span>
          {issue.def.advice}
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">
          <span className="font-semibold">Ćwiczenie: </span>
          {issue.def.drill} · <span className="font-medium text-[var(--accent-2)]">{issueProText(issue, norms)}</span>
        </p>
        {issue.findings.length > 0 && (
          <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
            {issue.findings.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                ctx={ctx}
                clip={issue.def.clip}
                targetName={f.targetSteamId ? nameOf.get(f.targetSteamId) ?? null : null}
                showAdvice={f.advice !== issue.def.advice}
              />
            ))}
          </div>
        )}
      </div>
    </LazyDetails>
  );
}
