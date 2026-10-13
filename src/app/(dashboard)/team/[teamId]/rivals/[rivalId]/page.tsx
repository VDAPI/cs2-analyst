import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Lightbulb, Play, Swords } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import { getRivalReport, getTeamContext } from "@/lib/team/load";
import { ANTISTRAT_MIN_TOGETHER, canManageRivals } from "@/lib/team/roster";
import {
  FAST_HIT_S,
  LATE_HIT_S,
  SETUP_PROBE_S,
  DEFAULT_PROBE_S,
  type Example,
  type Insight,
  type MapAntiStrat,
  type PlaceShare,
  type UtilityUse,
} from "@/lib/team/antistrat";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import { MapThumb } from "@/components/match";
import { TeamHeader } from "@/components/team/team-header";
import { RivalNotes, RivalEdit, BoardFromRival } from "@/components/team/rival-tools";
import { pctText } from "@/components/team/labels";

interface Props {
  params: Promise<{ teamId: string; rivalId: string }>;
  searchParams: Promise<{ map?: string }>;
}

const UTIL_KEY: Record<string, MessageKey> = {
  SMOKE: "antistrat.utilSmoke",
  FLASH: "antistrat.utilFlash",
  MOLOTOV: "antistrat.utilMolotov",
  HE: "antistrat.utilHe",
  DECOY: "antistrat.utilDecoy",
};
const PACE_KEY: Record<string, MessageKey> = { fast: "antistrat.paceFast", default: "antistrat.paceDefault", late: "antistrat.paceLate" };
const BUY_KEY: Record<string, MessageKey> = { pistol: "antistrat.buyPistol", eco: "antistrat.buyEco", force: "antistrat.buyForce", full: "antistrat.buyFull" };
const ROLE_KEY: Record<string, MessageKey> = { awp: "antistrat.roleAwp", entry: "antistrat.roleEntry", lurk: "antistrat.roleLurk", anchor: "antistrat.roleAnchor" };

const exampleHref = (e: Example) => `/replay/${e.matchId}?round=${e.round}&tick=${e.tick}`;

function insightText(t: TFunction, i: Insight): string {
  const params = { ...i.params };
  if (typeof params.type === "string") params.type = t(UTIL_KEY[params.type] ?? "antistrat.utilSmoke");
  return t(`antistrat.insight.${i.key}` as MessageKey, params);
}

/** /team/[teamId]/rivals/[rivalId] — anti-strat report of one rival. */
export default async function RivalPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { teamId, rivalId } = await params;
  const query = await searchParams;
  const { t } = await getT();
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  if (!ctx) notFound();
  const rival = await prisma.teamRival.findFirst({
    where: { id: rivalId, teamId },
    select: { id: true, name: true, steamIds: true, notes: true, reportKey: true, report: true, createdById: true, updatedAt: true },
  });
  if (!rival) notFound();

  const { report } = await getRivalReport(prisma, ctx.memberUserIds, rival);
  // Changing a rival's players is for owner/coach only (see canManageRivals).
  const canEdit = canManageRivals(ctx.role);
  const known = await prisma.matchPlayer.findMany({
    where: { steamId: { in: rival.steamIds } },
    orderBy: { match: { date: "desc" } },
    distinct: ["steamId"],
    select: { steamId: true, name: true },
  });
  const nameOf = new Map(known.map((p) => [p.steamId, p.name]));

  const header = (
    <TeamHeader
      team={ctx.team}
      active="rivals"
      title={rival.name}
      description={t("antistrat.description", { n: report.matches.length })}
      back={{ href: `/team/${teamId}/rivals`, label: t("rivals.back") }}
    />
  );
  const tools = (
    <div className="grid gap-4 lg:grid-cols-2">
      <RivalNotes teamId={teamId} rivalId={rival.id} initial={rival.notes} />
      <RivalEdit
        teamId={teamId}
        rivalId={rival.id}
        name={rival.name}
        steamIds={rival.steamIds}
        names={Object.fromEntries(nameOf)}
        canEdit={canEdit}
      />
    </div>
  );

  if (report.matches.length === 0) {
    return (
      <div className="min-w-0 space-y-6">
        {header}
        <EmptyState icon={Swords} title={t("antistrat.emptyTitle")} description={t("antistrat.emptyBody", { n: ANTISTRAT_MIN_TOGETHER })} />
        {tools}
      </div>
    );
  }

  const map: MapAntiStrat = report.maps.find((m) => m.map === query.map) ?? report.maps[0];
  const pct = (n: number, of: number) => pctText(n, of);
  const placeList = (rows: PlaceShare[]) =>
    rows.length === 0 ? (
      <p className="text-sm text-[var(--text-tertiary)]">{t("antistrat.noFrames")}</p>
    ) : (
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.place} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{r.place}</span>
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
              <span className="block h-full bg-[var(--accent)]" style={{ width: `${Math.round((r.rounds / Math.max(1, r.of)) * 100)}%` }} />
            </span>
            <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-primary)]">{pct(r.rounds, r.of)}</span>
          </li>
        ))}
      </ul>
    );
  const utilityList = (rows: UtilityUse[], of: number) =>
    rows.length === 0 ? (
      <p className="text-sm text-[var(--text-tertiary)]">—</p>
    ) : (
      <ul className="space-y-1 text-sm">
        {rows.map((u) => (
          <li key={`${u.type}|${u.place}`} className="flex gap-2">
            <span className="shrink-0 text-[var(--text-primary)]">{t(UTIL_KEY[u.type] ?? "antistrat.utilSmoke")}</span>
            <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{u.place}</span>
            <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">
              {u.rounds}/{of}
            </span>
          </li>
        ))}
      </ul>
    );
  const examples = (list: Example[]) => (
    <span className="flex flex-wrap gap-1">
      {list.map((e) => (
        <Link
          key={`${e.matchId}:${e.round}`}
          href={exampleHref(e)}
          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 font-mono text-xs text-[var(--accent-hover)] hover:border-[var(--border-hover)] max-md:min-h-10"
          title={t("antistrat.openRound")}
        >
          <Play className="h-3 w-3" aria-hidden />R{e.round}
        </Link>
      ))}
    </span>
  );

  const hits = map.t.sites.A + map.t.sites.B + map.t.sites.none;

  return (
    <div className="min-w-0 space-y-8">
      {header}

      {report.insights.length > 0 && (
        <section aria-labelledby="wnioski" className="space-y-3">
          <SectionTitle>
            <span id="wnioski">{t("antistrat.insightsTitle")}</span>
          </SectionTitle>
          <ul className="grid gap-2 md:grid-cols-2">
            {report.insights.map((i, n) => (
              <li key={n} className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-2)]" aria-hidden />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm text-[var(--text-primary)]">
                    {i.map && <span className="mr-1 text-[var(--text-tertiary)]">{mapDisplayName(i.map)}:</span>}
                    {insightText(t, i)}
                  </p>
                  {i.example && examples([i.example])}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.maps.length > 1 && (
        <nav aria-label={t("antistrat.mapsLabel")} className="flex flex-wrap gap-2">
          {report.maps.map((m) => (
            <Link
              key={m.map}
              href={`/team/${teamId}/rivals/${rival.id}?map=${m.map}`}
              aria-current={m.map === map.map ? "true" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                m.map === map.map
                  ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
              )}
            >
              {mapDisplayName(m.map)} <span className="font-mono text-xs text-[var(--text-tertiary)]">{m.matches}</span>
            </Link>
          ))}
        </nav>
      )}

      {/* T side */}
      <section aria-labelledby="strona-t" className="space-y-3">
        <SectionTitle
          action={<BoardFromRival teamId={teamId} rivalId={rival.id} map={map.map} side="T" name={`${rival.name}: T ${mapDisplayName(map.map)}`} disabled={map.t.board.length === 0} />}
        >
          <span id="strona-t" className="flex items-center gap-2">
            <MapThumb map={map.map} size="sm" />
            {t("antistrat.tTitle", { map: mapDisplayName(map.map) })}
          </span>
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("antistrat.rounds")} value={String(map.t.rounds)} sub={t("antistrat.wonOf", { n: map.t.wins, of: map.t.rounds })} />
          <Stat label={t("antistrat.siteA")} value={pct(map.t.sites.A, hits)} sub={`${map.t.sites.A}/${hits}`} tone="t" />
          <Stat label={t("antistrat.siteB")} value={pct(map.t.sites.B, hits)} sub={`${map.t.sites.B}/${hits}`} tone="t" />
          <Stat
            label={t("antistrat.pace")}
            value={`${map.t.paces.fast}/${map.t.paces.default}/${map.t.paces.late}`}
            sub={t("antistrat.paceLegend", { fast: FAST_HIT_S, late: LATE_HIT_S })}
          />
        </div>

        <Card className="p-0 md:p-0">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("antistrat.colExecute")}</th>
                  <th>{t("antistrat.colRounds")}</th>
                  <th>{t("antistrat.colWon")}</th>
                  <th>{t("antistrat.colHit")}</th>
                  <th>{t("antistrat.colPlayers")}</th>
                  <th>{t("antistrat.colUtility")}</th>
                  <th>{t("antistrat.colRounds2D")}</th>
                </tr>
              </thead>
              <tbody>
                {map.t.executes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-[var(--text-tertiary)]">
                      {t("antistrat.noExecutes")}
                    </td>
                  </tr>
                )}
                {map.t.executes.map((e) => (
                  <tr key={`${e.site}|${e.pace}`}>
                    <td className="whitespace-nowrap font-medium">
                      {e.site} · {t(PACE_KEY[e.pace])}
                    </td>
                    <td className="font-mono">{e.rounds}</td>
                    <td className="font-mono">{pct(e.wins, e.rounds)}</td>
                    <td className="font-mono">{Math.round(e.hitS)} s</td>
                    <td className="font-mono">{e.players.toFixed(1)}</td>
                    <td className="min-w-[180px] text-xs text-[var(--text-secondary)]">
                      {e.utility.length ? e.utility.slice(0, 3).map((u) => `${t(UTIL_KEY[u.type] ?? "antistrat.utilSmoke")} ${u.place} (${u.rounds})`).join(", ") : "—"}
                    </td>
                    <td>{examples(e.examples)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-2">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">{t("antistrat.defaultsTitle", { s: DEFAULT_PROBE_S })}</h3>
            {placeList(map.t.defaults)}
            {map.t.lurkRounds > 0 && <p className="text-xs text-[var(--text-tertiary)]">{t("antistrat.lurkRounds", { n: map.t.lurkRounds, of: map.t.rounds })}</p>}
          </Card>
          <Card className="space-y-2">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">{t("antistrat.openingsTitle")}</h3>
            {map.t.openings.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)]">—</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {map.t.openings.map((o) => (
                  <li key={o.place} className="flex gap-2">
                    <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{o.place}</span>
                    <span className="font-mono text-xs text-[var(--good)]">+{o.kills}</span>
                    <span className="font-mono text-xs text-[var(--mistake)]">−{o.deaths}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="space-y-2">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">{t("antistrat.byBuyTitle")}</h3>
            <ul className="space-y-1.5 text-sm">
              {(["pistol", "eco", "force", "full"] as const).map((k) => {
                const b = map.t.byBuy[k];
                if (b.rounds === 0) return null;
                return (
                  <li key={k} className="flex gap-2">
                    <span className="min-w-0 flex-1 text-[var(--text-secondary)]">{t(BUY_KEY[k])}</span>
                    <span className="font-mono text-xs text-[var(--text-primary)]">
                      A {b.A} · B {b.B}
                    </span>
                    <span className="w-14 text-right font-mono text-xs text-[var(--text-tertiary)]">{pct(b.wins, b.rounds)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </section>

      {/* CT side */}
      <section aria-labelledby="strona-ct" className="space-y-3">
        <SectionTitle
          action={<BoardFromRival teamId={teamId} rivalId={rival.id} map={map.map} side="CT" name={`${rival.name}: CT ${mapDisplayName(map.map)}`} disabled={map.ct.board.length === 0} />}
        >
          <span id="strona-ct">{t("antistrat.ctTitle", { map: mapDisplayName(map.map) })}</span>
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("antistrat.rounds")} value={String(map.ct.rounds)} sub={t("antistrat.wonOf", { n: map.ct.wins, of: map.ct.rounds })} />
          <Stat
            label={t("antistrat.retakes")}
            value={`${map.ct.retakes.won}/${map.ct.retakes.rounds}`}
            sub={t("antistrat.retakesSub", { alive: map.ct.retakes.aliveAtPlant.toFixed(1), saved: map.ct.retakes.saved })}
            tone="ct"
          />
          <Stat label={t("antistrat.stacks")} value={`A ${map.ct.stacks.A} · B ${map.ct.stacks.B}`} sub={t("antistrat.stacksSub")} tone="ct" />
          <Stat
            label={t("antistrat.aggression")}
            value={pct(map.ct.aggression.rounds, map.ct.rounds)}
            sub={map.ct.aggression.places[0]?.place ?? "—"}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-2">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">{t("antistrat.setupsTitle", { s: SETUP_PROBE_S })}</h3>
            {map.ct.setups.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)]">{t("antistrat.noFrames")}</p>
            ) : (
              <ul className="space-y-2">
                {map.ct.setups.map((s) => (
                  <li key={`${s.A}-${s.mid}-${s.B}`} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-semibold text-[var(--ct-blue)]">
                      A{s.A} · M{s.mid} · B{s.B}
                    </span>
                    <span className="flex-1 font-mono text-xs text-[var(--text-tertiary)]">
                      {s.rounds}× · {pct(s.wins, s.rounds)}
                    </span>
                    {examples(s.examples.slice(0, 2))}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="space-y-2">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">{t("antistrat.positionsTitle")}</h3>
            {placeList(map.ct.positions)}
          </Card>
          <Card className="space-y-2">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">{t("antistrat.ctUtilityTitle")}</h3>
            {utilityList(map.ct.utility, map.ct.rounds)}
          </Card>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          {t("antistrat.pistols", {
            t: `${map.pistols.t.n}/${map.pistols.t.of}`,
            ct: `${map.pistols.ct.n}/${map.pistols.ct.of}`,
            eco: map.afterPistolLoss.eco,
            force: map.afterPistolLoss.force,
            full: map.afterPistolLoss.full,
          })}
        </p>
      </section>

      {/* Players */}
      <section aria-labelledby="gracze-rywala" className="space-y-3">
        <SectionTitle>
          <span id="gracze-rywala">{t("antistrat.playersTitle")}</span>
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
                  <th>AWP</th>
                  <th>{t("antistrat.colCtSpot")}</th>
                  <th>{t("antistrat.colTSpot")}</th>
                  <th>{t("antistrat.colRole")}</th>
                </tr>
              </thead>
              <tbody>
                {report.players.map((p) => (
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
                    <td className="font-mono">{p.awpKills}</td>
                    <td className="whitespace-nowrap text-xs">{p.ctSpot ? `${p.ctSpot.place} (${pct(p.ctSpot.rounds, p.ctSpot.of)})` : "—"}</td>
                    <td className="whitespace-nowrap text-xs">{p.tSpot ? `${p.tSpot.place} (${pct(p.tSpot.rounds, p.tSpot.of)})` : "—"}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {p.roles.map((r) => (
                          <Badge key={r} variant={r === "awp" ? "lime" : "neutral"}>
                            {t(ROLE_KEY[r])}
                          </Badge>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {tools}

      <section aria-labelledby="dema-rywala" className="space-y-3">
        <SectionTitle>
          <span id="dema-rywala">{t("antistrat.matchesTitle", { n: report.matches.length })}</span>
        </SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-2">
          {report.matches.map((m) => (
            <li key={m.matchId}>
              <Link
                href={`/replay/${m.matchId}`}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-2.5 transition-colors hover:border-[var(--border-hover)]"
              >
                <MapThumb map={m.map} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">{mapDisplayName(m.map)}</span>
                <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                  {m.rivalScore}:{m.oppScore}
                </span>
                <span className="font-mono text-xs text-[var(--text-tertiary)]">{formatDate(m.date)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--text-tertiary)]">{t("antistrat.matchesHint", { n: ANTISTRAT_MIN_TOGETHER })}</p>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ct" | "t" }) {
  return (
    <Card className="p-4 md:p-4">
      <p className="label-overline truncate text-[var(--text-tertiary)]">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-xl font-semibold tabular-nums",
          tone === "ct" ? "text-[var(--ct-blue)]" : tone === "t" ? "text-[var(--t-gold)]" : "text-[var(--text-primary)]"
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{sub}</p>}
    </Card>
  );
}
