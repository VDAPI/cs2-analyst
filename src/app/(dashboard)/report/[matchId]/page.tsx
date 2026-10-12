import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { CheckCircle2, ClipboardCheck, Dumbbell, Lightbulb, Play, Sparkles, Trophy } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Card, EmptyState, FindingTag, PageHeader, SectionTitle, buttonVariants } from "@/components/ui";
import { FindingClip } from "@/components/replay/finding-clip";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { getMapConfig } from "@/lib/utils/maps";
import { cn } from "@/lib/utils/cn";
import { getFindings } from "@/lib/findings/persist";
import { buildReport, formatMetric, playerMetrics, type ReportIssue, type ReportMetric } from "@/lib/findings/report";
import { fmtRoundTime, replayHref, toFindingView, type FindingView } from "@/lib/findings/view";
import type { AimSummary } from "@/lib/findings/report";
import { FindingCard, type ClipContext } from "./finding-card";

interface Props {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ player?: string }>;
}

const STATUS_TONE: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warning)]",
  bad: "text-[var(--mistake)]",
  none: "text-[var(--text-secondary)]",
};

export default async function ReportPage({ params, searchParams }: Props) {
  const { matchId } = await params;
  const { player } = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  const match = await prisma.match.findFirst({
    where: { id: matchId, upload: { userId: session.user.id } },
    select: {
      id: true,
      map: true,
      scoreCT: true,
      scoreT: true,
      players: { select: { steamId: true, name: true, team: true } },
    },
  });
  if (!match) notFound();

  const all = (await getFindings(prisma, matchId)).map(toFindingView);
  const nameOf = new Map(match.players.map((p) => [p.steamId, p.name]));
  const players = [...match.players].sort((a, b) =>
    a.team === b.team ? a.name.localeCompare(b.name) : a.team === "CT" ? -1 : 1
  );
  const countOf = new Map<string, number>();
  for (const f of all) if (f.severity !== "low") countOf.set(f.steamId, (countOf.get(f.steamId) ?? 0) + 1);

  const selected =
    players.find((p) => p.steamId === player) ??
    players.find((p) => p.steamId === session.user.steamId) ??
    [...players].sort((a, b) => (countOf.get(b.steamId) ?? 0) - (countOf.get(a.steamId) ?? 0))[0];

  const [mech, aim, tactics, util] = selected
    ? await Promise.all([
        prisma.mechanicsStats.findUnique({ where: { matchId_steamId: { matchId, steamId: selected.steamId } } }),
        prisma.aimStats.findUnique({ where: { matchId_steamId: { matchId, steamId: selected.steamId } } }),
        prisma.tacticsStats.findUnique({ where: { matchId_steamId: { matchId, steamId: selected.steamId } } }),
        prisma.utilityStats.findUnique({ where: { matchId_steamId: { matchId, steamId: selected.steamId } } }),
      ])
    : [null, null, null];

  const mine = selected ? all.filter((f) => f.steamId === selected.steamId) : [];
  const metrics = playerMetrics(mech, aim as AimSummary | null, tactics, util);
  const report = buildReport<FindingView>(mine, metrics);

  const mapConfig = getMapConfig(match.map);
  const ctx: ClipContext = {
    matchId,
    mapName: mapDisplayName(match.map),
    mapConfig: mapConfig
      ? {
          posX: mapConfig.posX,
          posY: mapConfig.posY,
          scale: mapConfig.scale,
          width: mapConfig.width,
          height: mapConfig.height,
          radarImage: mapConfig.radarImage,
        }
      : null,
  };
  const hasData = mech != null || aim != null || tactics != null || util != null;

  return (
    <div className="min-w-0 space-y-8">
      <PageHeader
        back={{ href: `/matches/${matchId}`, label: "Wróć do meczu" }}
        eyebrow="Raport meczu"
        title="Co poprawić"
        description={
          <>
            {mapDisplayName(match.map)}{" "}
            <span className="font-mono tabular-nums">
              {match.scoreCT}:{match.scoreT}
            </span>
            {selected && <> · {selected.name}</>}. Najpierw trzy rzeczy, które najbardziej kosztują cię rundy, potem
            wszystkie błędy według kategorii.
          </>
        }
        actions={
          selected && (
            <Link
              href={`/replay/${matchId}?player=${selected.steamId}`}
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
              Replay z błędami
            </Link>
          )
        }
      />

      {/* Player picker */}
      <nav aria-label="Gracz" className="-mx-4 md:mx-0">
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 md:flex-wrap md:overflow-visible md:px-0">
          {players.map((p) => {
            const active = p.steamId === selected?.steamId;
            const n = countOf.get(p.steamId) ?? 0;
            return (
              <Link
                key={p.steamId}
                href={`/report/${matchId}?player=${p.steamId}`}
                scroll={false}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                  active
                    ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: p.team === "CT" ? "var(--ct-blue)" : "var(--t-gold)" }}
                  aria-hidden
                />
                <span className="max-w-[140px] truncate">{p.name}</span>
                {p.steamId === session.user.steamId && <span className="text-xs text-[var(--accent-2)]">ty</span>}
                <span className="font-mono text-xs text-[var(--text-tertiary)]" title="Błędy do poprawy i poważne">
                  {n}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {!hasData ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Brak danych do raportu"
          description="Raport powstaje z danych replaya zapisanych przy analizie. Ten mecz był analizowany, zanim je zapisywaliśmy; wgraj demo ponownie, a raport pojawi się automatycznie."
          action={
            <Link href="/upload" className={buttonVariants({ variant: "cta" })}>
              Wgraj demo
            </Link>
          }
        />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryTile label="Wykryte błędy" value={report.totals.findings} />
            <SummaryTile label="Poważne" value={report.totals.high} tone="text-[var(--mistake)]" />
            <SummaryTile label="Kosztowały walkę" value={report.totals.costly} tone="text-[var(--warning)]" />
            <SummaryTile label="Rundy z błędem" value={report.totals.rounds} />
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
                <TopIssue key={issue.type} rank={i + 1} issue={issue} ctx={ctx} nameOf={nameOf} />
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
                      <p className="text-xs text-[var(--text-tertiary)]">próg {m.threshold}</p>
                    </div>
                    <span className="font-mono text-lg font-semibold text-[var(--good)]">{formatMetric(m)}</span>
                  </div>
                ))}
              </div>
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
                    <IssueDetails key={issue.type} issue={issue} ctx={ctx} nameOf={nameOf} />
                  ))
                )}
              </div>
            ))}
          </section>

          <p className="text-xs text-[var(--text-tertiary)]">
            Błędy oceniamy po tym, co mogłeś wiedzieć w danej chwili (widoczność z gry, dźwięk, info od teamu), a nie
            po widoku z góry. Wartości „pro” są orientacyjne, z publicznych średnich; dokładne normy z dem
            profesjonalistów dojdą w kolejnej aktualizacji. Kolejność top 3 bierze pod uwagę liczbę i wagę błędów,
            to, czy kosztowały walkę, oraz wynik metryki w całym meczu.
          </p>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="p-4 md:p-4">
      <p className="label-overline truncate text-[var(--text-tertiary)]">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-semibold tabular-nums", tone ?? "text-[var(--text-primary)]")}>
        {value}
      </p>
    </Card>
  );
}

function MetricLine({ metric }: { metric: ReportMetric }) {
  return (
    <p className="text-sm text-[var(--text-secondary)]">
      {metric.label}:{" "}
      <span className={cn("font-mono font-semibold", STATUS_TONE[metric.status])}>{formatMetric(metric)}</span>
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
}: {
  rank: number;
  issue: ReportIssue<FindingView>;
  ctx: ClipContext;
  nameOf: Map<string, string>;
}) {
  const worst = issue.findings[0];
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
        </p>
        {issue.metric && <MetricLine metric={issue.metric} />}
        <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-2)]" aria-hidden />
          <span>
            <span className="font-medium text-[var(--accent-2)]">{issue.def.pro}</span>
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
          {worst && (
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
          <FindingClip
            matchId={ctx.matchId}
            mapName={ctx.mapName}
            mapConfig={ctx.mapConfig}
            roundNumber={worst.roundNumber}
            tick={worst.tick}
            steamId={worst.steamId}
            targetSteamId={worst.targetSteamId}
            severity={worst.severity}
            clip={issue.def.clip}
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
}: {
  issue: ReportIssue<FindingView>;
  ctx: ClipContext;
  nameOf: Map<string, string>;
}) {
  return (
    <details
      id={`issue-${issue.type}`}
      className="group scroll-mt-20 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] open:border-[var(--border-hover)]"
    >
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:px-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">{issue.def.title}</span>
        {issue.metric && issue.metric.value != null && (
          <span className={cn("font-mono text-sm font-semibold", STATUS_TONE[issue.metric.status])}>
            {formatMetric(issue.metric)}
          </span>
        )}
        <span className="font-mono text-xs text-[var(--text-tertiary)]">{issue.findings.length}×</span>
        {issue.metric?.status === "good" ? (
          <FindingTag severity="good">Dobrze</FindingTag>
        ) : (
          <FindingTag severity={issue.severity} />
        )}
      </summary>
      <div className="space-y-3 border-t border-[var(--border)] px-3 py-3 sm:px-4">
        {issue.metric && <MetricLine metric={issue.metric} />}
        <p className="text-sm text-[var(--text-secondary)]">{issue.def.why}</p>
        <p className="text-sm text-[var(--text-primary)]">
          <span className="font-semibold text-[var(--accent-hover)]">Rada: </span>
          {issue.def.advice}
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">
          <span className="font-semibold">Ćwiczenie: </span>
          {issue.def.drill} · <span className="font-medium text-[var(--accent-2)]">{issue.def.pro}</span>
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
    </details>
  );
}
