import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Clapperboard, Upload } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { ClipCard } from "@/components/clips/clip-card";
import { loadProgress } from "@/lib/progress/load";
import { loadHighlights, loadMistakes } from "@/lib/clips/load";
import { findingClipShare, highlightClipShare, highlightTitle } from "@/lib/clips/clip";
import { findingDef, isFindingType } from "@/lib/findings/catalog";
import { FINDING_TYPES_EN } from "@/lib/coach/catalog-en";
import { reportClipContext } from "@/lib/findings/player-report";
import { fmtRoundTime, replayHref } from "@/lib/findings/view";
import { momentReplayPath } from "@/lib/sharing/share";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";

interface Props {
  searchParams: Promise<{ tab?: string; match?: string }>;
}

/** Cards that load their 2D clip as they scroll in; the rest wait for a tap. */
const AUTOLOAD = 4;

/**
 * Clips (S25): the player's best moments (won clutches, aces, 4K/3K) and
 * costliest mistakes as 2D clips to download (MP4/GIF) or share. With
 * `?match=` it shows every player's highlights of that match.
 */
export default async function ClipsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const query = await searchParams;
  const { t, locale } = await getT();
  const tab = query.tab === "mistakes" ? "mistakes" : "highlights";

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { steamId: true, faceitNickname: true } });
  const me = await loadProgress(prisma, { userId, sessionSteamId: user?.steamId, faceitNickname: user?.faceitNickname, limit: 1 });
  const match = query.match
    ? await prisma.match.findFirst({
        where: { id: query.match, upload: { userId, deletedAt: null } },
        select: { id: true, map: true, date: true },
      })
    : null;
  const matchId = match?.id ?? null;

  const header = (
    <PageHeader
      eyebrow={t("clips.eyebrow")}
      title={t("clips.title")}
      back={match ? { href: `/matches/${match.id}`, label: t("clips.backToMatch") } : undefined}
      description={
        match ? (
          <>
            {mapDisplayName(match.map)} · <span className="font-mono">{formatDate(match.date)}</span>
          </>
        ) : (
          t("clips.description")
        )
      }
    />
  );

  if (me.totalMatches === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={Clapperboard}
          title={t("clips.emptyTitle")}
          description={t("clips.emptyBody")}
          action={
            <Link href="/upload" className={buttonVariants({ variant: "cta" })}>
              <Upload className="h-4 w-4" aria-hidden />
              {t("progress.upload")}
            </Link>
          }
        />
      </div>
    );
  }

  const tabHref = (k: string) => {
    const q = new URLSearchParams();
    if (k !== "highlights") q.set("tab", k);
    if (matchId) q.set("match", matchId);
    const s = q.toString();
    return s ? `/clips?${s}` : "/clips";
  };
  const tabs = (
    <nav aria-label={t("clips.tabsLabel")} className="flex gap-2">
      {(["highlights", "mistakes"] as const).map((k) => (
        <Link
          key={k}
          href={tabHref(k)}
          aria-current={tab === k ? "page" : undefined}
          className={cn(
            "flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold transition-colors",
            tab === k
              ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
          )}
        >
          {t(k === "highlights" ? "clips.tabHighlights" : "clips.tabMistakes")}
        </Link>
      ))}
    </nav>
  );

  const grid = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";

  if (tab === "highlights") {
    const rows = await loadHighlights(prisma, { userId, steamId: me.steamId, matchId });
    return (
      <div className="space-y-6">
        {header}
        {tabs}
        {rows.length === 0 ? (
          <EmptyState icon={Clapperboard} title={t("clips.noHighlights")} description={t("clips.noHighlightsBody")} />
        ) : (
          <div className={grid}>
            {rows.map((h, i) => {
              const ctx = reportClipContext(h.match.id, h.match.map);
              const clip = highlightClipShare(h);
              const title = highlightTitle(t, clip);
              return (
                <ClipCard
                  key={`${h.match.id}-${h.key}`}
                  matchId={h.match.id}
                  mapName={ctx.mapName}
                  mapConfig={ctx.mapConfig}
                  round={h.round}
                  title={title}
                  meta={`${ctx.mapName} · R${h.round} · ${formatDate(h.match.date)}`}
                  playerName={h.playerName}
                  badge={{
                    label: h.headshots > 0 ? t("clips.kills", { n: h.kills, hs: h.headshots }) : t("clips.killsNoHs", { n: h.kills }),
                    variant: "lime",
                  }}
                  steamId={h.steamId}
                  clip={clip}
                  replayHref={momentReplayPath(h.match.id, { round: h.round, tick: h.from, player: h.steamId })}
                  autoLoad={i < AUTOLOAD}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const mistakes = await loadMistakes(prisma, { userId, steamId: me.steamId, matchId });
  const name = me.candidates.find((c) => c.steamId === me.steamId)?.name ?? "";
  return (
    <div className="space-y-6">
      {header}
      {tabs}
      {mistakes.length === 0 ? (
        <EmptyState icon={Clapperboard} title={t("clips.noMistakes")} description={t("clips.noMistakesBody")} />
      ) : (
        <div className={grid}>
          {mistakes.map((f, i) => {
            const ctx = reportClipContext(f.match.id, f.match.map);
            const def = findingDef(f.type);
            const title = locale === "en" && isFindingType(f.type) ? FINDING_TYPES_EN[f.type].label : def.label;
            return (
              <ClipCard
                key={f.id}
                matchId={f.match.id}
                mapName={ctx.mapName}
                mapConfig={ctx.mapConfig}
                round={f.round}
                title={title}
                meta={`${ctx.mapName} · R${f.round} ${fmtRoundTime(f.roundTime)} · ${formatDate(f.match.date)}`}
                playerName={name}
                badge={{ label: t("clips.mistakeBadge"), variant: "error" }}
                steamId={f.steamId}
                clip={findingClipShare({ ...f, severity: f.severity }, def.clip)}
                replayHref={replayHref(f.match.id, { id: f.id, roundNumber: f.round, tick: f.tick, steamId: f.steamId })}
                autoLoad={i < AUTOLOAD}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
