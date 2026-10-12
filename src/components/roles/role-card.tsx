import Link from "next/link";
import { Lightbulb, Swords } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { TFunction } from "@/lib/i18n/translate";
import { formatNormValue } from "@/lib/norms/view";
import { cn } from "@/lib/utils/cn";
import type { ReportRole } from "@/lib/roles/report-role";
import type { Role } from "@/lib/roles/roles";
import { ROLE_TONE, roleAdviceKey, roleDescKey, roleKey, roleTipKeys, type RoleMetricComparison } from "@/lib/roles/view";
import { metricLabel } from "./labels";

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
  t,
}: {
  data: ReportRole;
  mapName: string;
  compareHref: string | null;
  t: TFunction;
}) {
  const { role } = data;
  const roleName = role ? t(roleKey(role)) : "";
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
              </Badge>
            ) : null
          )}
        </div>
      </div>

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
