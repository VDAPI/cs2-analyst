import { Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { AdminNav } from "@/components/admin/admin-nav";
import { MlActions } from "@/components/admin/ml-actions";
import { countAdminUploads } from "@/lib/admin/data";
import { requireAdminPage } from "@/lib/admin/session";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";
import { formatDateTime } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import { WP_FEATURES_VERSION } from "@/lib/winprob/features";
import { PRIOR_SOURCES } from "@/lib/winprob/prior";
import { ML_MIN_MATCHES, mlServiceUrl } from "@/lib/winprob/train-trigger";

interface CandidateMetrics {
  logloss: number;
  brier: number;
  auc: number;
  ece: number;
  calibration: { a: number; b: number } | null;
}

interface Evaluation {
  folds?: number;
  best?: string;
  candidates?: Record<string, CandidateMetrics>;
}

const CANDIDATES = ["prior", "logistic", "lgbm", "lgbm_mono"];

interface LastRun {
  note?: string;
  matches?: number;
  evaluation?: unknown;
}

/** The trainer's note about its last run that kept the current model (AppSetting "winprob:lastRun"). */
function parseRun(value: string | undefined): LastRun | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as LastRun;
  } catch {
    return null;
  }
}

function readEvaluation(v: unknown): Evaluation | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Evaluation;
  return e.candidates && typeof e.candidates === "object" ? e : null;
}

/** Round win-probability model (S14): data, the active model, how the candidates compared, retraining. */
export default async function AdminMlPage() {
  await requireAdminPage();
  const { t } = await getT();
  const [counts, dataAgg, proData, situations, models, lastRun] = await Promise.all([
    countAdminUploads(),
    prisma.winProbData.aggregate({ where: { version: WP_FEATURES_VERSION }, _count: true, _sum: { rounds: true } }),
    prisma.winProbData.count({ where: { version: WP_FEATURES_VERSION, pro: true } }),
    prisma.proSituation.count(),
    prisma.winProbModel.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, kind: true, active: true, featuresVersion: true, metrics: true, nMatches: true, nRounds: true, createdAt: true },
    }),
    prisma.appSetting.findUnique({ where: { key: "winprob:lastRun" } }),
  ]);
  const active = models.find((m) => m.active && m.featuresVersion === WP_FEATURES_VERSION) ?? null;
  const run = parseRun(lastRun?.value);
  // The comparison of the newest training: the active model's, or the last run that kept the prior.
  const evaluation = readEvaluation(active?.metrics) ?? readEvaluation(run?.evaluation);
  const service = mlServiceUrl();
  const label = (kind: string) =>
    CANDIDATES.includes(kind) ? t(`winprob.admin.candidate.${kind}` as MessageKey) : kind;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title={t("winprob.admin.title")} description={t("winprob.admin.description")} />
      <AdminNav failed={counts.failed} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label={t("winprob.admin.statData")}
          value={dataAgg._count}
          hint={t("winprob.admin.statDataHint", { rounds: dataAgg._sum.rounds ?? 0, pro: proData })}
        />
        <StatCard label={t("winprob.admin.statSituations")} value={situations} hint={t("winprob.admin.statSituationsHint")} />
        <StatCard
          label={t("winprob.admin.statModel")}
          value={active ? label(active.kind) : t("winprob.admin.statModelPrior")}
          highlight={active != null}
          className="col-span-2 lg:col-span-1"
          hint={
            active
              ? `${t("winprob.admin.statModelTrained", { kind: active.kind, n: active.nMatches })} · ${t("winprob.admin.trainedAt", { date: formatDateTime(active.createdAt) })}`
              : undefined
          }
        />
      </div>

      <Card className="space-y-3">
        <CardHeader title={t("winprob.admin.service")} />
        <p className="break-words font-mono text-xs text-[var(--text-secondary)]">
          {service ? t("winprob.admin.serviceOn", { url: service }) : t("winprob.admin.serviceOff")}
        </p>
        {run?.note && (
          <p className="text-xs text-[var(--text-tertiary)]">
            {t("winprob.admin.lastRun", { note: `${run.note} (${run.matches ?? 0})` })}
          </p>
        )}
        <MlActions />
      </Card>

      <section className="space-y-3" aria-labelledby="ml-compare">
        <h2 id="ml-compare" className="font-display text-lg font-semibold text-[var(--text-primary)]">
          {t("winprob.admin.compare")}
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">{t("winprob.admin.compareHint")}</p>
        {!evaluation?.candidates ? (
          <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-tertiary)]">
            {t("winprob.admin.compareNone", { min: ML_MIN_MATCHES })}
          </p>
        ) : (
          <div className="table-scroll rounded-xl border border-[var(--border)]">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("winprob.admin.colCandidate")}</th>
                  <th className="text-right">{t("winprob.admin.colLogloss")}</th>
                  <th className="text-right">{t("winprob.admin.colBrier")}</th>
                  <th className="text-right">{t("winprob.admin.colAuc")}</th>
                  <th className="text-right">{t("winprob.admin.colEce")}</th>
                  <th className="text-right">{t("winprob.admin.colCal")}</th>
                </tr>
              </thead>
              <tbody>
                {CANDIDATES.filter((c) => evaluation.candidates?.[c]).map((c) => {
                  const m = evaluation.candidates![c];
                  const chosen = active ? evaluation.best === c : c === "prior";
                  return (
                    <tr key={c}>
                      <td className={cn("min-w-[140px] whitespace-normal", chosen && "font-semibold text-[var(--accent-2)]")}>
                        {label(c)}
                        {chosen && <span className="text-xs"> · {t("winprob.admin.chosen")}</span>}
                      </td>
                      <td className="text-right font-mono">{m.logloss.toFixed(4)}</td>
                      <td className="text-right font-mono">{m.brier.toFixed(4)}</td>
                      <td className="text-right font-mono">{Number.isFinite(m.auc) ? m.auc.toFixed(3) : "–"}</td>
                      <td className="text-right font-mono">{m.ece.toFixed(3)}</td>
                      <td className="text-right font-mono text-xs">
                        {m.calibration ? `${m.calibration.a.toFixed(2)}·x${m.calibration.b >= 0 ? "+" : ""}${m.calibration.b.toFixed(2)}` : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {models.length > 0 && (
        <Card className="space-y-2">
          <CardHeader title={t("winprob.admin.history")} />
          <ul className="space-y-1 text-sm">
            {models.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className={cn("font-mono text-xs", m.active ? "text-[var(--accent-2)]" : "text-[var(--text-tertiary)]")}>
                  {formatDateTime(m.createdAt)}
                </span>
                <span className="text-[var(--text-primary)]">{label(m.kind)}</span>
                <span className="font-mono text-xs text-[var(--text-tertiary)]">
                  {m.nMatches} / {m.nRounds} · v{m.featuresVersion}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-2">
        <CardHeader title={t("winprob.admin.sources")} />
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--text-secondary)]">
          {PRIOR_SOURCES.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
