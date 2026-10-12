import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { EmptyState, PageHeader } from "@/components/ui";
import { PublicShell } from "@/components/share/public-shell";
import { FindingClip } from "@/components/replay/finding-clip";
import { getFindings } from "@/lib/findings/persist";
import { loadPlayerReport, reportClipContext } from "@/lib/findings/player-report";
import { fmtRoundTime, toFindingView } from "@/lib/findings/view";
import { MOMENT_CLIP, isShareToken } from "@/lib/sharing/share";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { formatDate } from "@/lib/utils/formatters";
import { loadReportNorms } from "@/lib/norms/report-norms";
import { ReportBody } from "@/app/(dashboard)/report/[matchId]/report-body";
import { loadReportWinProb } from "@/lib/winprob/report";
import { highlightTitle, parseClipShare, type ClipShare } from "@/lib/clips/clip";
import { findingDef, isFindingType } from "@/lib/findings/catalog";
import { FINDING_TYPES_EN } from "@/lib/coach/catalog-en";
import type { Locale } from "@/lib/i18n/config";
import type { TFunction } from "@/lib/i18n/translate";

interface Props {
  params: Promise<{ token: string }>;
}

const TICK_RATE = 64;

/** Title of a shared clip: the highlight ("Clutch 1v3") or the mistake's name. */
function clipTitle(t: TFunction, locale: Locale, clip: ClipShare): string {
  if (clip.kind === "finding" && clip.findingType && isFindingType(clip.findingType)) {
    return locale === "en" ? FINDING_TYPES_EN[clip.findingType].label : findingDef(clip.findingType).label;
  }
  return highlightTitle(t, clip);
}

async function loadShare(token: string) {
  if (!isShareToken(token)) return null;
  const share = await prisma.share.findUnique({
    where: { token },
    include: {
      user: { select: { name: true, publicProfile: true, publicSlug: true } },
      match: {
        select: {
          id: true,
          map: true,
          date: true,
          scoreCT: true,
          scoreT: true,
          players: { select: { steamId: true, name: true, team: true } },
          rounds: { select: { number: true, startTick: true } },
          upload: { select: { deletedAt: true } },
        },
      },
    },
  });
  if (!share || share.revokedAt || !share.match.upload || share.match.upload.deletedAt) return null;
  return share;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const share = await loadShare(token);
  if (!share) return { title: "CS2 Analyst", robots: { index: false } };
  const { t, locale } = await getT();
  const map = mapDisplayName(share.match.map);
  const clip = share.kind === "clip" ? parseClipShare(share.clip) : null;
  const title = clip
    ? `${clipTitle(t, locale, clip)} · ${t("shared.momentTitle", { map, round: share.roundNumber ?? 1 })} — CS2 Analyst`
    : share.kind === "moment"
      ? `${t("shared.momentTitle", { map, round: share.roundNumber ?? 1 })} — CS2 Analyst`
      : `${t("shared.reportEyebrow")}: ${map} ${share.match.scoreCT}:${share.match.scoreT} — CS2 Analyst`;
  return { title, robots: { index: false, follow: false } };
}

/** A public link (S16): one player's report of a match, one replay moment, or a 2D clip (S25). Read-only, no login. */
export default async function SharedPage({ params }: Props) {
  const { token } = await params;
  const share = await loadShare(token);
  if (!share) notFound();
  const { t, locale } = await getT();
  await prisma.share.update({ where: { id: share.id }, data: { views: { increment: 1 } } });

  const match = share.match;
  const nameOf = new Map(match.players.map((p) => [p.steamId, p.name]));
  const player = share.steamId ? nameOf.get(share.steamId) ?? null : null;
  const sharedBy = share.user.name ? t("shared.sharedBy", { name: share.user.name }) : t("shared.sharedByAnon");
  const ctx = reportClipContext(match.id, match.map, share.token);
  const scoreline = (
    <span className="font-mono tabular-nums">
      {match.scoreCT}:{match.scoreT}
    </span>
  );

  const clip = share.kind === "clip" ? parseClipShare(share.clip) : null;
  if (share.kind === "clip") {
    if (!clip || share.roundNumber == null) notFound();
    const round = share.roundNumber;
    const title = clipTitle(t, locale, clip);
    const startTick = match.rounds.find((r) => r.number === round)?.startTick ?? 0;
    const at = Math.max(0, (clip.focus - startTick) / TICK_RATE);
    const where = t("shared.momentTitle", { map: ctx.mapName, round });
    return (
      <PublicShell>
        <PageHeader
          eyebrow={t("clips.sharedEyebrow")}
          title={title}
          description={
            <>
              {where} · {scoreline} · <span className="font-mono">{formatDate(match.date)}</span>
              {player && <> · {t("shared.player", { name: player })}</>} · {sharedBy}
            </>
          }
        />
        <div className="mx-auto w-full max-w-[640px] space-y-2">
          <FindingClip
            matchId={match.id}
            mapName={ctx.mapName}
            mapConfig={ctx.mapConfig}
            roundNumber={round}
            tick={clip.focus}
            steamId={share.steamId ?? ""}
            targetSteamId={clip.target ?? null}
            severity={clip.severity ?? "low"}
            clip={{ before: 0, after: 0 }}
            range={{ from: clip.from, to: clip.to }}
            follow={clip.follow}
            marks={clip.marks}
            marker={clip.kind === "finding"}
            share={share.token}
            autoLoad
            label={`${title}, ${where}, ${fmtRoundTime(at)}`}
            exportInfo={{
              title,
              subtitle: [player, `${ctx.mapName} · R${round}`].filter(Boolean).join(" · "),
              map: ctx.mapName,
              round,
            }}
          />
          <p className="text-xs text-[var(--text-tertiary)]">{t("clips.sharedHint")}</p>
        </div>
      </PublicShell>
    );
  }

  if (share.kind === "moment" && share.roundNumber != null && share.tick != null) {
    const round = share.roundNumber;
    const notes = await prisma.mapNote.findMany({
      where: { matchId: match.id, userId: share.userId, roundNumber: round },
      orderBy: { tick: "asc" },
      select: { id: true, tick: true, x: true, y: true, text: true },
    });
    const startTick = match.rounds.find((r) => r.number === round)?.startTick ?? 0;
    const at = Math.max(0, (share.tick - startTick) / TICK_RATE);
    return (
      <PublicShell>
        <PageHeader
          eyebrow={t("shared.momentEyebrow")}
          title={t("shared.momentTitle", { map: ctx.mapName, round })}
          description={
            <>
              {scoreline} · <span className="font-mono">{formatDate(match.date)}</span>
              {player && <> · {t("shared.player", { name: player })}</>} · {sharedBy}
            </>
          }
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,640px)_minmax(240px,1fr)] lg:items-start">
          <FindingClip
            matchId={match.id}
            mapName={ctx.mapName}
            mapConfig={ctx.mapConfig}
            roundNumber={round}
            tick={share.tick}
            steamId={share.steamId ?? ""}
            targetSteamId={null}
            severity="low"
            clip={MOMENT_CLIP}
            share={share.token}
            marker={false}
            notes={notes.map((n, i) => ({ x: n.x, y: n.y, tick: n.tick, label: String(i + 1) }))}
            autoLoad
            label={`${t("shared.momentTitle", { map: ctx.mapName, round })}, ${fmtRoundTime(at)}`}
          />
          <section aria-labelledby="notatki" className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
            <h2 id="notatki" className="label-overline mb-2 text-[var(--text-tertiary)]">
              {t("shared.notes")}
            </h2>
            {notes.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)]">{t("shared.noNotes")}</p>
            ) : (
              <ol className="space-y-2">
                {notes.map((n, i) => (
                  <li key={n.id} className="flex items-start gap-2 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-2)] font-mono text-xs font-bold text-[var(--on-accent)]">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-[var(--text-secondary)]">{n.text}</span>
                    <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">
                      {fmtRoundTime(Math.max(0, (n.tick - startTick) / TICK_RATE))}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              <span className="font-mono">R{round} · {fmtRoundTime(at)}</span>
            </p>
          </section>
        </div>
      </PublicShell>
    );
  }

  // Report link.
  const steamId = share.steamId;
  const all = (await getFindings(prisma, match.id)).map(toFindingView);
  const loaded = steamId ? await loadPlayerReport(prisma, match.id, steamId, all) : null;
  const norms =
    steamId && loaded?.hasData
      ? await loadReportNorms(prisma, { matchId: match.id, steamId, map: match.map, metrics: loaded.metrics, rounds: loaded.rounds, t })
      : null;
  const winprob = steamId && loaded?.hasData ? await loadReportWinProb(prisma, match.id, steamId, t, locale) : null;

  return (
    <PublicShell>
      <PageHeader
        eyebrow={t("shared.reportEyebrow")}
        title={`${ctx.mapName}`}
        description={
          <>
            {scoreline} · <span className="font-mono">{formatDate(match.date)}</span>
            {player && <> · {t("shared.player", { name: player })}</>} · {sharedBy}
          </>
        }
      />
      {loaded?.hasData ? (
        <div className="min-w-0 space-y-8">
          <ReportBody report={loaded.report} ctx={ctx} nameOf={nameOf} norms={norms} winprob={winprob} />
        </div>
      ) : (
        <EmptyState title={t("shared.noData")} />
      )}
    </PublicShell>
  );
}
