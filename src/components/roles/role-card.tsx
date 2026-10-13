import Link from "next/link";
import { Lightbulb, MapPin, Swords } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { TFunction } from "@/lib/i18n/translate";
import { formatNormValue } from "@/lib/norms/view";
import { cn } from "@/lib/utils/cn";
import type { ReportRole } from "@/lib/roles/report-role";
import type { Role } from "@/lib/roles/roles";
import {
  activityNoteKey,
  ROLE_TONE,
  roleAdviceKey,
  roleDescKey,
  roleKey,
  roleTipKeys,
  type Activity,
  type RoleMetricComparison,
  type SidePositions,
} from "@/lib/roles/view";
import { metricLabel } from "./labels";
import { RoleCorrection } from "./role-correction";

const VERDICT_TONE: Record<string, string> = {
  better: "text-[var(--good)]",
  within: "text-[var(--text-secondary)]",
  worse: "text-[var(--mistake)]",
};

export function RoleBadge({ role, t, className }: { role: Role; t: TFunction; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", className)}
      style={{ color: ROLE_TONE[role], borderColor: ROLE_TONE[role] }}
    >
      {t(roleKey(role))}
    </span>
  );
}

/**
 * "You played entry on Mirage" (S24): the match role, roles per side, the
 * role's key metrics against pros of that role and advice for the role.
 */
export function RoleCard({
  data,
  mapName,
  compareHref,
  correction,
  t,
}: {
  data: ReportRole;
  mapName: string;
  compareHref: string | null;
  /** The uploader may correct the role (S31); absent on public views. */
  correction?: { matchId: string; steamId: string } | null;
  t: TFunction;
}) {
  const { role } = data;
  const roleName = role ? t(roleKey(role)) : "";
  const sides = (["T", "CT"] as const).filter((side) => data.sides[side] || data.detected[side] || data.positions[side]);
  return (
    <Card className="space-y-4" data-testid="role-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="label-overline text-[var(--text-tertiary)]">{t("roles.reportTitle")}</p>
          <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
            {role ? (
              t("roles.reportHeadline", { role: roleName, map: mapName })
            ) : (
              t("roles.reportHeadlineNone", { map: mapName })
            )}
          </h2>
          {role && <p className="text-sm text-[var(--text-secondary)]">{t(roleDescKey(role))}</p>}
        </div>
        <div className="flex flex-wrap gap-2" aria-label={t("roles.sideRoles")}>
          {(["T", "CT"] as const).map((side) =>
            data.sides[side] ? (
              <Badge key={side} variant={side === "T" ? "t" : "ct"}>
                {side}: {t(roleKey(data.sides[side]!))}
                {side === "CT" && data.sides.CT === "anchor" && data.positions.CT?.site ? ` ${data.positions.CT.site}` : ""}
              </Badge>
            ) : null
          )}
        </div>
      </div>

      {sides.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {sides.map((side) => (
            <SidePanel key={side} side={side} data={data} t={t} />
          ))}
        </div>
      )}

      {role && data.comparisons.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--text-tertiary)]">
            {data.roleSpecific ? t("roles.reportVsRole", { role: roleName }) : t("roles.reportVsAllPros", { role: roleName })}
          </p>
          <RoleMetricTable rows={data.comparisons} proLabel={data.roleSpecific ? t("roles.colPro") : t("norms.colPro")} t={t} />
        </div>
      )}

      {role && (
        <div className="space-y-2">
          <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
            {t("roles.reportAdviceTitle", { role: roleName })}
          </h3>
          {data.advice.length === 0 && <p className="text-sm text-[var(--text-secondary)]">{t("roles.reportNoAdvice")}</p>}
          <ul className="space-y-2">
            {(data.advice.length > 0
              ? data.advice.map((a) => ({ key: a.key, text: t(roleAdviceKey(role, a.metric)) }))
              : roleTipKeys(role).slice(0, 2).map((k) => ({ key: k, text: t(k) }))
            ).map((line) => (
              <li key={line.key} className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-2)]" aria-hidden />
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {correction && sides.length > 0 && (
        <RoleCorrection
          matchId={correction.matchId}
          steamId={correction.steamId}
          sides={sides.map((side) => ({
            side,
            match: data.source[side] === "match" ? data.sides[side] : null,
            auto: data.usual[side] ?? data.detected[side],
          }))}
        />
      )}

      {compareHref && (
        <Link
          href={compareHref}
          className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-[var(--accent-hover)] underline-offset-2 hover:underline"
        >
          <Swords className="h-4 w-4" aria-hidden />
          {t("roles.compareLink")} →
        </Link>
      )}
    </Card>
  );
}

/** One side: the role (and whether it was corrected), activity and positions round by round (S31). */
function SidePanel({ side, data, t }: { side: "T" | "CT"; data: ReportRole; t: TFunction }) {
  const role = data.sides[side];
  const source = data.source[side];
  const detected = data.detected[side];
  const positions = data.positions[side] ?? null;
  const activity = data.activity[side] ?? null;
  const tone = side === "T" ? "var(--t-gold)" : "var(--ct-blue)";
  return (
    <section
      className="min-w-0 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
      aria-label={`${side}${role ? `: ${t(roleKey(role))}` : ""}`}
      data-testid={`role-side-${side}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-sm font-semibold" style={{ color: tone }}>
          {side}
        </span>
        {role && <RoleBadge role={role} t={t} />}
        {source && (
          <span className="text-xs text-[var(--accent-2)]">
            {source === "match" ? t("roles.correct.corrected") : t("roles.correct.correctedDefault")}
          </span>
        )}
        {source && detected && detected !== role && (
          <span className="text-xs text-[var(--text-tertiary)]">{t("roles.correct.detected", { role: t(roleKey(detected)) })}</span>
        )}
      </div>

      {activity && <ActivityBlock activity={activity} role={role} positions={positions} t={t} />}
      {positions && <PositionsBlock positions={positions} t={t} />}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
      <p className="font-mono text-sm text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

const pctText = (v: number | null) => (v == null ? "–" : `${v}%`);

function ActivityBlock({
  activity,
  role,
  positions,
  t,
}: {
  activity: Activity;
  role: Role | null;
  positions: SidePositions | null;
  t: TFunction;
}) {
  return (
    <div className="space-y-2">
      <p className="label-overline text-[var(--text-tertiary)]">{t("roles.activity.title")}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Stat label={t("roles.activity.tempo")} value={activity.tempoS == null ? "–" : `${activity.tempoS.toFixed(1)} s`} />
        <Stat label={t("roles.activity.firstContact")} value={pctText(activity.firstContactShare)} />
        <Stat label={t("roles.activity.contact")} value={pctText(activity.contactShare)} />
        <Stat label={t("roles.activity.quiet")} value={pctText(activity.quietShare)} />
      </div>
      {role && <p className="text-xs text-[var(--text-secondary)]">{t(activityNoteKey(role, positions))}</p>}
    </div>
  );
}

function PositionsBlock({ positions, t }: { positions: SidePositions; t: TFunction }) {
  const zoneLabel = { A: t("roles.positions.zoneA"), B: t("roles.positions.zoneB"), mid: t("roles.positions.zoneMid") };
  return (
    <div className="space-y-2">
      <p className="label-overline text-[var(--text-tertiary)]">{t("roles.positions.title")}</p>
      {positions.top.length > 0 ? (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--text-primary)]">
          <span className="text-[var(--text-tertiary)]">{t("roles.positions.top")}:</span>
          {positions.top.map((p) => (
            <span key={p.place}>
              {p.place} <span className="font-mono text-xs text-[var(--text-tertiary)]">{p.share}%</span>
            </span>
          ))}
        </p>
      ) : (
        <p className="text-xs text-[var(--text-tertiary)]">{t("roles.positions.noPlaces")}</p>
      )}
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
        {positions.zones && (
          <span>
            {t("roles.positions.zones")}:{" "}
            <span className="font-mono text-[var(--text-primary)]">
              {(["A", "B", "mid"] as const).map((z) => `${zoneLabel[z]} ${positions.zones![z]}%`).join(" · ")}
            </span>
          </span>
        )}
        <span>
          {t("roles.positions.isolated")}: <span className="font-mono text-[var(--text-primary)]">{pctText(positions.isolatedShare)}</span>
        </span>
        <span>
          {t("roles.positions.rotations")}: <span className="font-mono text-[var(--text-primary)]">{positions.rotations}</span>
        </span>
      </p>
      {positions.rounds.length > 0 && (
        <details className="group">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-medium text-[var(--accent-hover)]">
            <MapPin className="h-4 w-4" aria-hidden />
            {t("roles.positions.rounds", { n: positions.rounds.length })}
          </summary>
          <ol className="mt-1 space-y-1.5">
            {positions.rounds.map((r) => (
              <li key={r.round} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                <span className="w-8 shrink-0 font-mono font-semibold text-[var(--text-primary)]">R{r.round}</span>
                {r.zone && <span className="font-mono text-[var(--accent-2)]">{zoneLabel[r.zone]}</span>}
                <span className="min-w-0 break-words text-[var(--text-secondary)]">
                  {r.path.length > 0 ? r.path.join(" → ") : (r.place ?? "–")}
                </span>
                {r.isolated && <span className="text-[var(--warning)]">{t("roles.positions.roundIsolated")}</span>}
                {r.rotated && <span className="text-[var(--ct-blue)]">{t("roles.positions.roundRotated")}</span>}
                {!r.contact && <span className="text-[var(--text-tertiary)]">{t("roles.positions.roundQuiet")}</span>}
                {r.diedS != null && (
                  <span className="text-[var(--text-tertiary)]">{t("roles.positions.roundDied", { s: Math.round(r.diedS) })}</span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

export function RoleMetricTable({ rows, proLabel, t }: { rows: RoleMetricComparison[]; proLabel: string; t: TFunction }) {
  return (
    <div className="table-scroll rounded-xl border border-[var(--border)]">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("roles.colMetric")}</th>
            <th className="text-right">{t("roles.colYou")}</th>
            <th className="text-right">{proLabel}</th>
            <th className="text-right">{t("roles.colVerdict")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="min-w-[120px] max-w-[150px] whitespace-normal sm:max-w-[260px]">{metricLabel(t, r.metric, r.situation)}</td>
              <td className="text-right font-mono text-[var(--text-primary)]">{formatNormValue(r.value, r.unit)}</td>
              <td className="whitespace-nowrap text-right font-mono text-[var(--accent-2)]">
                {r.norm ? `${r.norm.source === "reference" ? "≈" : ""}${formatNormValue(r.norm.p50, r.unit)}` : "–"}
              </td>
              <td className={cn("text-right text-xs font-semibold", r.verdict ? VERDICT_TONE[r.verdict] : "text-[var(--text-tertiary)]")}>
                {r.verdict === "better"
                  ? t("roles.verdictBetter")
                  : r.verdict === "within"
                    ? t("roles.verdictWithin")
                    : r.verdict === "worse"
                      ? t("roles.verdictWorse")
                      : "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
