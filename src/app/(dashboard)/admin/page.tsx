import Link from "next/link";
import { AlertCircle, Hourglass, Radio } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { AdminNav } from "@/components/admin/admin-nav";
import { DailyAnalysesChart } from "@/components/charts/lazy-charts";
import { AdminAnalysesList } from "@/components/admin/admin-analyses-list";
import { countAdminUploads, getAdminOverview, getAdminUploads, METRIC_DAYS } from "@/lib/admin/data";
import { getQueueStats } from "@/lib/admin/queue-stats";
import { formatDuration } from "@/lib/admin/metrics";
import { sentryEnabled } from "@/lib/monitoring/sentry-options";
import { requireAdminPage } from "@/lib/admin/session";

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const [overview, queue, counts, failed] = await Promise.all([
    getAdminOverview(),
    getQueueStats(),
    countAdminUploads(),
    getAdminUploads("failed", 5),
  ]);
  const { analyses, users, parse7d, parse30d } = overview;
  const waiting = queue.ok ? queue.queues.reduce((s, q) => s + q.waiting + q.delayed, 0) : null;
  const active = queue.ok ? queue.queues.reduce((s, q) => s + q.active, 0) : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Panel admina" description="Użytkownicy, kolejka analiz, błędy i metryki." />
      <AdminNav failed={counts.failed} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Analizy dziś" value={analyses.today} highlight hint={`${analyses.last7d} w 7 dni`} />
        <StatCard
          label="W kolejce"
          value={waiting ?? "—"}
          hint={active == null ? "Redis niedostępny" : `${active} w trakcie`}
        />
        <StatCard
          label="Nieudane (7 dni)"
          value={analyses.failed7d}
          accentColor="var(--mistake)"
          hint={`${counts.failed} do przejrzenia`}
        />
        <StatCard
          label="Czas parsowania"
          value={formatDuration(parse7d.p50Ms)}
          hint={`mediana 7 dni · p95 ${formatDuration(parse7d.p95Ms)}`}
        />
      </div>

      {(analyses.stuck > 0 || counts.failed > 0) && (
        <div className="flex flex-wrap gap-2">
          {counts.failed > 0 && (
            <Link href="/admin/analyses?filter=failed">
              <Badge variant="error" className="min-h-8 px-3">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                Nieudane analizy: <span className="font-mono tabular-nums">{counts.failed}</span>
              </Badge>
            </Link>
          )}
          {analyses.stuck > 0 && (
            <Link href="/admin/analyses?filter=stuck">
              <Badge variant="warning" className="min-h-8 px-3">
                <Hourglass className="h-3.5 w-3.5" aria-hidden />
                Zawieszone: <span className="font-mono tabular-nums">{analyses.stuck}</span>
              </Badge>
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Analizy dziennie" description={`Ostatnie ${METRIC_DAYS} dni, wg dnia dodania`} />
          <DailyAnalysesChart data={analyses.daily} />
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Kolejka" description="Na żywo z Redis (BullMQ)" />
            {queue.ok ? (
              <div className="space-y-3">
                {queue.queues.map((q) => (
                  <div key={q.name}>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{q.label}</p>
                    <dl className="mt-1 grid grid-cols-4 gap-2 text-xs">
                      {[
                        { k: "Czeka", v: q.waiting + q.delayed },
                        { k: "Trwa", v: q.active },
                        { k: "Błędy", v: q.failed },
                        { k: "Gotowe", v: q.completed },
                      ].map((c) => (
                        <div key={c.k} className="min-w-0">
                          <dt className="label-overline truncate text-[var(--text-tertiary)]">{c.k}</dt>
                          <dd className="font-mono text-base font-semibold tabular-nums text-[var(--text-primary)]">
                            {c.v}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--mistake)]">Redis niedostępny: {queue.error}</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Czas parsowania" description="Od startu parsowania do zapisu raportu" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                { k: "Mediana 7 dni", v: formatDuration(parse7d.p50Ms) },
                { k: "p95 7 dni", v: formatDuration(parse7d.p95Ms) },
                { k: "Średnio 30 dni", v: formatDuration(parse30d.avgMs) },
                { k: "Najdłużej 30 dni", v: formatDuration(parse30d.maxMs) },
              ].map((r) => (
                <div key={r.k} className="min-w-0">
                  <dt className="text-xs text-[var(--text-tertiary)]">{r.k}</dt>
                  <dd className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">{r.v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-[var(--text-tertiary)]">
              Pomiarów: <span className="font-mono tabular-nums">{parse30d.count}</span> (30 dni)
            </p>
          </Card>

          <Card>
            <CardHeader title="Konta i monitoring" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-[var(--text-tertiary)]">Użytkownicy</dt>
                <dd className="font-mono font-semibold tabular-nums">{users.total}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-tertiary)]">Nowi (7 dni)</dt>
                <dd className="font-mono font-semibold tabular-nums">{users.new7d}</dd>
              </div>
            </dl>
            <p className="mt-3 flex items-center gap-2 text-sm">
              <Radio
                className={`h-4 w-4 ${sentryEnabled() ? "text-[var(--good)]" : "text-[var(--text-tertiary)]"}`}
                aria-hidden
              />
              {sentryEnabled() ? (
                <span className="text-[var(--text-secondary)]">Sentry włączony (aplikacja i workery)</span>
              ) : (
                <span className="text-[var(--text-tertiary)]">
                  Sentry wyłączony. Ustaw <code className="font-mono">SENTRY_DSN</code>, żeby zbierać błędy.
                </span>
              )}
            </p>
          </Card>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Ostatnie nieudane analizy</h2>
          {counts.failed > failed.length && (
            <Link href="/admin/analyses?filter=failed" className="text-sm text-[var(--accent-hover)] hover:underline">
              Wszystkie ({counts.failed})
            </Link>
          )}
        </div>
        <AdminAnalysesList rows={failed} emptyTitle="Brak nieudanych analiz" />
      </section>
    </div>
  );
}
