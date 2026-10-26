import { Card, SectionTitle } from "@/components/ui";
import type { TFunction } from "@/lib/i18n/translate";
import type { AntiStratReport } from "@/lib/team/antistrat";
import {
  BUY_KEY,
  roundText,
  thrownText,
  afterPistol,
  awpSummary,
  defaultSpots,
  namesFromReport,
  repeatedPlays,
  reportMap,
  summaryLines,
  tacticCounts,
  topUtility,
  utilName,
} from "@/lib/team/breakdown-text";
import { ctSpotOf, shortPlace } from "@/lib/team/map-lanes";
import { formatDate } from "@/lib/utils/formatters";
import { RepeatedPlays } from "./repeated-plays";
import { RoundBrowser } from "./round-browser";

function CountList({ rows, of }: { rows: Array<{ label: string; n: number }>; of: number }) {
  if (rows.length === 0) return <p className="text-sm text-[var(--text-tertiary)]">—</p>;
  return (
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
}

/**
 * Everything about one team on one map over its demos: key points, pistols
 * and the rounds after them, repeated plays, T tactics and default, CT
 * positions, utility, and every round of every demo (folded per demo).
 * Expects loadMapLanes() to have run for the map.
 */
export function TeamMapAnalysis({
  report,
  t,
  opponents,
  teams,
  shared,
}: {
  report: AntiStratReport;
  t: TFunction;
  /** The viewer's teams, to send a play to their tactic board. */
  teams?: Array<{ id: string; name: string }>;
  /** Public shared view: no replay links or boards. */
  shared?: boolean;
  /** Opponent label per match id ("vs MOUZ" lineup names). */
  opponents?: Map<string, string>;
}) {
  const map = reportMap(report);
  const nameOf = namesFromReport(report);
  const tRounds = report.rounds.filter((r) => r.side === "T");
  const ctRounds = report.rounds.filter((r) => r.side === "CT");
  const spot = (place: string) => ctSpotOf(map, place) ?? shortPlace(map, place);
  const after = afterPistol(t, report);
  const awp = awpSummary(report);

  return (
    <div className="space-y-6">
      <Card>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--text-primary)]">
          {summaryLines(t, report).map((line, n) => (
            <li key={n}>{line}</li>
          ))}
        </ul>
      </Card>

      {after.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Po pistoletówce</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {after.map((a) => (
              <Card key={String(a.won)} className="space-y-2">
                <h3 className={a.won ? "font-semibold text-[var(--good)]" : "font-semibold text-[var(--mistake)]"}>
                  {a.won ? "Po wygranym pistolecie" : "Po przegranym pistolecie"} ({a.pistols}×)
                </h3>
                {a.next.map((n) => (
                  <div key={n.offset} className="text-sm">
                    <p className="text-xs text-[var(--text-tertiary)]">{n.offset === 1 ? "Następna runda" : "Druga runda po pistolecie"}</p>
                    <ul className="text-[var(--text-secondary)]">{n.lines.length ? n.lines.map((l) => <li key={l}>{l}</li>) : <li>—</li>}</ul>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <SectionTitle>Powtarzane zagrywki T</SectionTitle>
        <RepeatedPlays plays={repeatedPlays(t, report)} board={teams && !shared ? { map, teams, nameOf } : undefined} shared={shared} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-2">
          <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">Taktyki T</h3>
          <CountList rows={tacticCounts(t, report).map(([label, n]) => ({ label, n }))} of={tRounds.length} />
        </Card>
        <Card className="space-y-2">
          <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">Default T</h3>
          <CountList rows={defaultSpots(map, tRounds).slice(0, 8).map((d) => ({ label: d.place, n: d.rounds }))} of={tRounds.length} />
        </Card>
        <Card className="space-y-2">
          <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">Pozycje CT</h3>
          <CountList
            rows={defaultSpots(
              map,
              ctRounds.map((r) => ({ ...r, positions: r.positions.map((p) => ({ ...p, place: spot(p.place) })) }))
            ).map((d) => ({ label: d.place, n: d.rounds }))}
            of={ctRounds.length}
          />
        </Card>
      </div>

      {awp.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>AWP</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {awp.map((a) => (
              <Card key={a.side} className="space-y-1.5 text-sm">
                <h3 className="font-semibold text-[var(--text-primary)]">
                  {a.side}: {a.kills} zabójstw z AWP, {a.early} w pierwszych 20 s
                </h3>
                <p className="text-[var(--text-secondary)]">{a.players.map((p) => `${p.name} ${p.kills}`).join(", ")}</p>
                <ul className="text-[var(--text-secondary)]">
                  {a.spots.map((s) => (
                    <li key={s.place} className="flex gap-2">
                      <span className="min-w-0 flex-1 truncate">{s.place}</span>
                      <span className="font-mono text-xs text-[var(--text-tertiary)]">
                        ×{s.kills} · ≈{s.clock}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(["T", "CT"] as const).map((side) => (
          <Card key={side} className="space-y-2">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">Granaty {side}</h3>
            <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
              {topUtility(
                map,
                report.rounds.filter((r) => r.side === side),
                8
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

      <section className="space-y-2">
        <SectionTitle>Rundy</SectionTitle>
        <RoundBrowser
          shared={shared}
          rounds={report.rounds.map((r) => {
            const text = roundText(t, map, r, nameOf);
            const m = report.matches.find((x) => x.matchId === r.matchId);
            const vs = opponents?.get(r.matchId);
            return {
              key: `${r.matchId}:${r.round}`,
              matchId: r.matchId,
              matchLabel: `${m ? `${m.rivalScore}:${m.oppScore}` : ""}${vs ? ` vs ${vs}` : ""}${m ? ` · ${formatDate(m.date)}` : ""}`,
              round: r.round,
              side: r.side,
              buyKind: r.buy,
              buyLabel: t(BUY_KEY[r.buy]),
              won: r.won,
              name: text.name,
              groups: text.groups,
              outcome: text.outcome,
              thrown: thrownText(t, map, r, nameOf),
              tick: r.tick,
            };
          })}
        />
      </section>
    </div>
  );
}
