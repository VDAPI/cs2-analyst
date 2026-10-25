import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { Download, Lightbulb, Play } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ownMatchWhere } from "@/lib/sharing/access";
import { getT } from "@/lib/i18n/server";
import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import { getMatchTeamReport } from "@/lib/team/load";
import { DEFAULT_PROBE_S, SETUP_PROBE_S, type Insight, type RoundBreakdown } from "@/lib/team/antistrat";
import {
  BUY_KEY,
  defaultSpots,
  namesFromReport,
  reportMap,
  roundText,
  summaryLines,
  tacticCounts,
  thrownText,
  topUtility,
  utilName,
} from "@/lib/team/breakdown-text";
import { ctSpotOf, shortPlace } from "@/lib/team/map-lanes";
import { repeatedPlays } from "@/lib/team/breakdown-text";
import { RepeatedPlays } from "@/components/team-analysis/repeated-plays";
import { loadMapLanes } from "@/lib/team/map-lanes-load";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, buttonVariants } from "@/components/ui";
import { PrintButton } from "@/components/team/print-button";
import { TeamAnalysisFiling } from "@/components/team-analysis/folder-tools";
import { folderOptions, userFolders } from "@/lib/team/folders";

interface Props {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ side?: string }>;
}

const ROLE_KEY: Record<string, MessageKey> = {
  awp: "antistrat.roleAwp",
  entry: "antistrat.roleEntry",
  lurk: "antistrat.roleLurk",
  anchor: "antistrat.roleAnchor",
};

function insightText(t: TFunction, i: Insight): string {
  const params = { ...i.params };
  if (typeof params.type === "string") params.type = utilName(t, params.type);
  return t(`antistrat.insight.${i.key}` as MessageKey, params);
}

/**
 * /matches/[matchId]/team — what one team of the demo played: key points,
 * pistols, force/eco rounds, T tactics and default, CT positions, utility and
 * a round-by-round list (the per-demo view of the S17 anti-strat analysis).
 */
export default async function MatchTeamPage({ params, searchParams }: Props) {
  const { matchId } = await params;
  const query = await searchParams;
  const where = await ownMatchWhere(matchId, { allowAdmin: true, allowTeam: true });
  if (!where) notFound();
  const match = await prisma.match.findFirst({
    where,
    select: { id: true, map: true, scoreCT: true, scoreT: true, players: { select: { steamId: true, name: true, team: true } } },
  });
  if (!match) notFound();
  const { t } = await getT();

  // Default: the team the viewer did not play for (scouting someone else's demo).
  const session = await getServerSession(authOptions);
  const mySide = match.players.find((p) => p.steamId === session?.user?.steamId)?.team;
  const side: "CT" | "T" = query.side === "T" || query.side === "CT" ? query.side : mySide === "CT" ? "T" : "CT";
  const lineups = (["CT", "T"] as const).map((s, n) => ({
    side: s,
    n: n + 1,
    names: match.players.filter((p) => p.team === s).map((p) => p.name),
  }));

  const ownUpload = session?.user?.id
    ? await prisma.demoUpload.findFirst({
        where: { matchId, userId: session.user.id, deletedAt: null },
        select: { id: true, kind: true, folderId: true },
      })
    : null;
  const folders = ownUpload && session?.user?.id ? folderOptions(await userFolders(prisma, session.user.id)) : [];
  const [report] = await Promise.all([getMatchTeamReport(prisma, matchId, side), loadMapLanes(prisma, match.map)]);
  const header = (
    <PageHeader
      back={{ href: `/matches/${matchId}`, label: t("teamDemo.back") }}
      eyebrow={mapDisplayName(match.map)}
      title={t("teamDemo.title")}
      description={t("teamDemo.description", {
        map: mapDisplayName(match.map),
        score: `${match.scoreCT}:${match.scoreT}`,
      })}
      actions={
        <div className="flex flex-wrap gap-2 print:hidden">
          <a href={`/api/matches/${matchId}/team-breakdown?side=${side}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Download className="h-4 w-4" aria-hidden />
            {t("teamDemo.downloadCsv")}
          </a>
          <PrintButton label={t("teamDemo.print")} />
        </div>
      }
    />
  );
  const picker = (
    <nav aria-label={t("teamDemo.pickTeam")} className="space-y-2 print:hidden">
      <p className="text-sm text-[var(--text-secondary)]">{t("teamDemo.pickTeam")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {lineups.map((l) => (
          <Link
            key={l.side}
            href={`/matches/${matchId}/team?side=${l.side}`}
            aria-current={l.side === side ? "true" : undefined}
            className={cn(
              "rounded-xl border p-3 text-sm transition-colors",
              l.side === side
                ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
            )}
          >
            <span className="font-semibold">{t("teamDemo.lineup", { n: l.n })}</span>
            <span className="mt-1 block truncate">{l.names.join(", ")}</span>
          </Link>
        ))}
      </div>
      {ownUpload && (
        <TeamAnalysisFiling uploadId={ownUpload.id} kind={ownUpload.kind} folderId={ownUpload.folderId} options={folders} />
      )}
      <Link href={`/callouts?map=${match.map}`} className="inline-block text-xs text-[var(--accent-hover)] hover:underline">
        {t("teamDemo.calloutsLink")}
      </Link>
    </nav>
  );

  if (!report || report.rounds.length === 0) {
    return (
      <div className="min-w-0 space-y-6">
        {header}
        {picker}
        <EmptyState icon={Lightbulb} title={t("teamDemo.unavailable")} description="" />
      </div>
    );
  }

  const nameOf = namesFromReport(report);
  const mapName = reportMap(report);
  const tRounds = report.rounds.filter((r) => r.side === "T");
  const ctRounds = report.rounds.filter((r) => r.side === "CT");
  const pistols = report.rounds.filter((r) => r.buy === "pistol");
  const ecoForce = report.rounds.filter((r) => r.buy === "eco" || r.buy === "force");
  const replay = (r: RoundBreakdown) => `/replay/${r.matchId}?round=${r.round}&tick=${r.tick}`;
  const spotOf = (place: string) => ctSpotOf(mapName, place) ?? shortPlace(mapName, place);

  const roundCard = (r: RoundBreakdown) => {
    const text = roundText(t, mapName, r, nameOf);
    return (
      <li key={r.round} className="space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[var(--text-primary)]">R{r.round}</span>
          <SideBadge side={r.side} />
          <Badge variant="neutral">{t(BUY_KEY[r.buy])}</Badge>
          <span className={r.won ? "text-[var(--good)]" : "text-[var(--mistake)]"}>{r.won ? t("teamDemo.won") : t("teamDemo.lost")}</span>
          <ReplayLink href={replay(r)} label={t("antistrat.openRound")} />
        </p>
        <p className="font-display text-base font-semibold text-[var(--text-primary)]">{text.name}</p>
        <ul className="space-y-0.5 text-[var(--text-secondary)]">
          {text.groups.map((g, n) => (
            <li key={n}>{g}</li>
          ))}
        </ul>
        {text.outcome && <p className="text-[var(--text-secondary)]">{text.outcome}</p>}
        <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">{thrownText(t, mapName, r, nameOf)}</p>
      </li>
    );
  };
  const countList = (rows: Array<{ label: string; n: number }>, of: number) => (
    <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
      {rows.map((d) => (
        <li key={d.label} className="flex gap-2">
          <span className="min-w-0 flex-1 truncate">{d.label}</span>
          <span className="font-mono text-xs text-[var(--text-tertiary)]">
            {d.n}/{of}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="min-w-0 space-y-8">
      {header}
      {picker}

      <section aria-labelledby="najwazniejsze" className="space-y-3">
        <SectionTitle>
          <span id="najwazniejsze">{t("teamDemo.summaryTitle")}</span>
        </SectionTitle>
        <Card className="space-y-2">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--text-primary)]">
            {summaryLines(t, report).map((line, n) => (
              <li key={n}>{line}</li>
            ))}
            {report.insights.map((i, n) => (
              <li key={`i${n}`}>{insightText(t, i)}</li>
            ))}
          </ul>
        </Card>
      </section>

      <section aria-labelledby="zagrywki" className="space-y-3">
        <SectionTitle>
          <span id="zagrywki">Powtarzane zagrywki T</span>
        </SectionTitle>
        <RepeatedPlays plays={repeatedPlays(t, report)} />
      </section>

      <section aria-labelledby="pistolety" className="space-y-3">
        <SectionTitle>
          <span id="pistolety">{t("teamDemo.pistolsTitle")}</span>
        </SectionTitle>
        {pistols.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">{t("teamDemo.noPistols")}</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">{pistols.map(roundCard)}</ul>
        )}
      </section>

      <section aria-labelledby="force-eco" className="space-y-3">
        <SectionTitle>
          <span id="force-eco">{t("teamDemo.ecoTitle")}</span>
        </SectionTitle>
        {ecoForce.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">{t("teamDemo.noEco")}</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">{ecoForce.map(roundCard)}</ul>
        )}
      </section>

      <section aria-labelledby="strona-t" className="space-y-3">
        <SectionTitle>
          <span id="strona-t">{t("teamDemo.tTitle")}</span>
        </SectionTitle>
        {tRounds.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">{t("teamDemo.noSide")}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-2">
              <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">{t("antistrat.colExecute")}</h3>
              {countList(
                tacticCounts(t, report).map(([label, n]) => ({ label, n })),
                tRounds.length
              )}
            </Card>
            <Card className="space-y-2">
              <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">{t("antistrat.defaultsTitle", { s: DEFAULT_PROBE_S })}</h3>
              {countList(
                defaultSpots(mapName, tRounds)
                  .slice(0, 8)
                  .map((d) => ({ label: d.place, n: d.rounds })),
                tRounds.length
              )}
            </Card>
          </div>
        )}
      </section>

      <section aria-labelledby="strona-ct" className="space-y-3">
        <SectionTitle>
          <span id="strona-ct">{t("teamDemo.ctTitle")}</span>
        </SectionTitle>
        {ctRounds.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">{t("teamDemo.noSide")}</p>
        ) : (
          <Card className="space-y-2">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">{t("antistrat.setupsTitle", { s: SETUP_PROBE_S })}</h3>
            {countList(
              defaultSpots(
                mapName,
                ctRounds.map((r) => ({ ...r, positions: r.positions.map((p) => ({ ...p, place: spotOf(p.place) })) }))
              ).map((d) => ({ label: d.place, n: d.rounds })),
              ctRounds.length
            )}
          </Card>
        )}
      </section>

      <section aria-labelledby="gracze" className="space-y-3">
        <SectionTitle>
          <span id="gracze">{t("teamDemo.playersTitle")}</span>
        </SectionTitle>
        <Card className="p-0 md:p-0">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("team.colPlayer")}</th>
                  <th>{t("teamDemo.tSpot")}</th>
                  <th>{t("teamDemo.ctSpot")}</th>
                  <th>{t("antistrat.colRole")}</th>
                  <th>K/D</th>
                </tr>
              </thead>
              <tbody>
                {report.players.map((p) => (
                  <tr key={p.steamId}>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-xs">{p.tSpot ? `${shortPlace(mapName, p.tSpot.place)} (${p.tSpot.rounds}/${p.tSpot.of})` : "—"}</td>
                    <td className="text-xs">{p.ctSpot ? `${spotOf(p.ctSpot.place)} (${p.ctSpot.rounds}/${p.ctSpot.of})` : "—"}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {p.roles.map((r) => (
                          <Badge key={r} variant={r === "awp" ? "lime" : "neutral"}>
                            {t(ROLE_KEY[r])}
                          </Badge>
                        ))}
                      </span>
                    </td>
                    <td className="font-mono">
                      {p.kills}/{p.deaths}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section aria-labelledby="granaty" className="space-y-3">
        <SectionTitle>
          <span id="granaty">{t("teamDemo.utilityTitle")}</span>
        </SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          {(["T", "CT"] as const).map((s) => (
            <Card key={s} className="space-y-2">
              <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-[var(--text-primary)]">
                <SideBadge side={s} />
              </h3>
              <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                {topUtility(
                  mapName,
                  report.rounds.filter((r) => r.side === s),
                  10
                ).map((u) => (
                  <li key={`${u.type}|${u.place}`} className="flex gap-2">
                    <span className="w-20 shrink-0 text-[var(--text-primary)]">{utilName(t, u.type)}</span>
                    <span className="min-w-0 flex-1 truncate">{u.place}</span>
                    <span className="font-mono text-xs text-[var(--text-tertiary)]">×{u.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="rundy" className="space-y-3">
        <SectionTitle>
          <span id="rundy">{t("teamDemo.roundsTitle")}</span>
        </SectionTitle>
        <ul className="grid gap-2 md:grid-cols-2">{report.rounds.map(roundCard)}</ul>
      </section>
    </div>
  );
}

function SideBadge({ side }: { side: "CT" | "T" }) {
  return (
    <span className={cn("font-mono text-xs font-semibold", side === "CT" ? "text-[var(--ct-blue)]" : "text-[var(--t-gold)]")}>{side}</span>
  );
}

function ReplayLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      title={label}
      className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 font-mono text-xs text-[var(--accent-hover)] hover:border-[var(--border-hover)] print:hidden"
    >
      <Play className="h-3 w-3" aria-hidden />
      2D
    </Link>
  );
}
