import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Play, Settings, Users } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { findTeamMatches, getTeamContext, loadTeamMatchInputs } from "@/lib/team/load";
import { buildTeamDashboard, type Record2 } from "@/lib/team/stats";
import { minTogether } from "@/lib/team/roster";
import { categoryLabel, findingCopy } from "@/lib/coach/copy";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import { Card, EmptyState, SectionTitle, buttonVariants } from "@/components/ui";
import { MapThumb, ResultBadge } from "@/components/match";
import { TeamHeader } from "@/components/team/team-header";
import { pctText } from "@/components/team/labels";

interface Props {
  params: Promise<{ teamId: string }>;
}

/** /team/[teamId] — the team dashboard: shared stats of the matches the team played together. */
export default async function TeamDashboardPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { teamId } = await params;
  const { t, locale } = await getT();
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  if (!ctx) notFound();

  const heads = await findTeamMatches(prisma, ctx);
  const inputs = await loadTeamMatchInputs(prisma, heads);
  const d = buildTeamDashboard(inputs, ctx.roster);
  const header = <TeamHeader team={ctx.team} active="overview" title={t("team.overviewTitle")} description={t("team.overviewDescription")} />;

  if (ctx.roster.length < 2) {
    return (
      <div className="min-w-0 space-y-6">
        {header}
        <EmptyState
          icon={Users}
          title={t("team.rosterTooSmallTitle")}
          description={t("team.rosterTooSmallBody")}
          action={
            <Link href={`/team/${teamId}/settings`} className={buttonVariants({ variant: "cta" })}>
              <Settings className="h-4 w-4" aria-hidden />
              {t("team.openSettings")}
            </Link>
          }
        />
      </div>
    );
  }

  if (d.matches === 0) {
    return (
      <div className="min-w-0 space-y-6">
        {header}
        <EmptyState
          icon={Users}
          title={t("team.noMatchesTitle")}
          description={t("team.noMatchesBody", { n: minTogether(ctx.roster.length), roster: ctx.roster.length })}
          action={
            <Link href="/upload" className={buttonVariants({ variant: "cta" })}>
              {t("team.uploadDemo")}
            </Link>
          }
        />
      </div>
    );
  }

  const nameOf = new Map(d.players.map((p) => [p.steamId, p.name]));
  const tile = (label: string, value: string, sub?: string, highlight?: boolean) => (
    <Card className="border-t-2 p-4 md:p-4" style={{ borderTopColor: highlight ? "var(--accent-2)" : "var(--accent)" }}>
      <p className="label-overline truncate text-[var(--text-tertiary)]">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-semibold tabular-nums", highlight ? "text-[var(--accent-2)]" : "text-[var(--text-primary)]")}>{value}</p>
      {sub && <p className="mt-0.5 font-mono text-xs text-[var(--text-tertiary)]">{sub}</p>}
    </Card>
  );
  const rec = (r: Record2) => `${r.won}/${r.played}`;

  return (
    <div className="min-w-0 space-y-8">
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tile(t("team.tileRecord"), `${d.wins}–${d.losses}${d.draws ? `–${d.draws}` : ""}`, t("team.tileMatches", { n: d.matches }), true)}
        {tile(t("team.tileRounds"), pctText(d.rounds.won, d.rounds.played), rec(d.rounds))}
        {tile(t("team.tileCt"), pctText(d.ct.won, d.ct.played), rec(d.ct))}
        {tile(t("team.tileT"), pctText(d.t.won, d.t.played), rec(d.t))}
        {tile(t("team.tilePistols"), pctText(d.pistols.won, d.pistols.played), rec(d.pistols))}
        {tile(t("team.tilePostPlant"), pctText(d.postPlant.won, d.postPlant.played), rec(d.postPlant))}
        {tile(t("team.tileRetakes"), pctText(d.retakes.won, d.retakes.played), rec(d.retakes))}
        {tile(t("team.tileTrades"), pctText(d.trades.traded, d.trades.deaths), t("team.tileTradesSub", { n: d.trades.traded, of: d.trades.deaths }))}
      </div>

      <section aria-labelledby="mapy" className="space-y-3">
        <SectionTitle>
          <span id="mapy">{t("team.mapsTitle")}</span>
        </SectionTitle>
        <Card className="p-0 md:p-0">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("team.colMap")}</th>
                  <th>{t("team.colMatches")}</th>
                  <th>{t("team.colWl")}</th>
                  <th>{t("team.colRounds")}</th>
                  <th>CT</th>
                  <th>T</th>
                  <th>{t("team.colPistols")}</th>
                </tr>
              </thead>
              <tbody>
                {d.maps.map((m) => (
                  <tr key={m.map}>
                    <td className="font-medium">{mapDisplayName(m.map)}</td>
                    <td className="font-mono">{m.matches}</td>
                    <td className="font-mono">
                      {m.wins}–{m.losses}
                    </td>
                    <td className="font-mono">{pctText(m.rounds.won, m.rounds.played)}</td>
                    <td className="font-mono text-[var(--ct-blue)]">{pctText(m.ct.won, m.ct.played)}</td>
                    <td className="font-mono text-[var(--t-gold)]">{pctText(m.t.won, m.t.played)}</td>
                    <td className="font-mono">{rec(m.pistols)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section aria-labelledby="gracze" className="space-y-3">
        <SectionTitle>
          <span id="gracze">{t("team.playersTitle")}</span>
        </SectionTitle>
        <Card className="p-0 md:p-0">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("team.colPlayer")}</th>
                  <th>{t("team.colMatches")}</th>
                  <th>Rating</th>
                  <th>ADR</th>
                  <th>K/D</th>
                  <th>{t("team.colOpenings")}</th>
                  <th>{t("team.colClutches")}</th>
                  <th>{t("team.colTraded")}</th>
                </tr>
              </thead>
              <tbody>
                {d.players.map((p) => (
                  <tr key={p.steamId}>
                    <td className="font-medium">{p.name}</td>
                    <td className="font-mono">{p.matches}</td>
                    <td className="font-mono">{p.rating.toFixed(2)}</td>
                    <td className="font-mono">{p.adr.toFixed(1)}</td>
                    <td className="font-mono">
                      {p.kills}/{p.deaths}
                    </td>
                    <td className="font-mono">
                      {p.firstKills}–{p.firstDeaths}
                    </td>
                    <td className="font-mono">
                      {p.clutchWins}/{p.clutchAttempts}
                    </td>
                    <td className="font-mono">{pctText(p.deathsTraded.won, p.deathsTraded.played)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-xs text-[var(--text-tertiary)]">{t("team.playersHint")}</p>
      </section>

      {d.findings.length > 0 && (
        <section aria-labelledby="bledy" className="space-y-3">
          <SectionTitle>
            <span id="bledy">{t("team.mistakesTitle")}</span>
          </SectionTitle>
          <p className="-mt-1 text-xs text-[var(--text-tertiary)]">{t("team.mistakesHint")}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {d.findings.slice(0, 8).map((f) => (
              <li key={f.type} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{findingCopy(f.type, locale).label}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{categoryLabel(f.category, locale)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm tabular-nums text-[var(--text-primary)]">{f.count}</p>
                    <p className="font-mono text-[11px] text-[var(--text-tertiary)]">{t("team.per10", { n: f.per10.toFixed(1) })}</p>
                  </div>
                </div>
                <p className="mt-2 truncate text-xs text-[var(--text-secondary)]">
                  {f.players
                    .slice(0, 3)
                    .map((p) => `${nameOf.get(p.steamId) ?? p.steamId} ×${p.count}`)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="mecze-druzyny" className="space-y-3">
        <SectionTitle>
          <span id="mecze-druzyny">{t("team.recentTitle")}</span>
        </SectionTitle>
        <ul className="space-y-2">
          {d.recent.slice(0, 10).map((m) => (
            <li key={m.matchId}>
              <Link
                href={`/replay/${m.matchId}`}
                className="flex min-h-14 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-2.5 transition-colors hover:border-[var(--border-hover)]"
              >
                <MapThumb map={m.map} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                    <span className="truncate">{mapDisplayName(m.map)}</span>
                    <ResultBadge result={m.result} />
                    <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                      {m.own}:{m.opp}
                    </span>
                  </p>
                  <p className="font-mono text-xs text-[var(--text-tertiary)]">{formatDate(m.date)}</p>
                </div>
                <Play className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-label={t("team.openReplay")} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
