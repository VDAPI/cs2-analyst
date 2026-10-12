import Link from "next/link";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { AdminNav } from "@/components/admin/admin-nav";
import { ProDemoUpload, RefreshNormsButton, RemoveProDemoButton } from "@/components/admin/pro-demo-manager";
import { countAdminUploads } from "@/lib/admin/data";
import { getT } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { normsRefreshedAt, proPoolSize } from "@/lib/norms/persist";

const STATUS_VARIANT: Record<string, "success" | "error" | "warning" | "default"> = {
  COMPLETED: "success",
  FAILED: "error",
  PARSING: "warning",
  QUEUED: "default",
  DOWNLOADING: "default",
};

/** The pro pool the norms are measured on (S13): add demos, remove them, recompute. */
export default async function AdminProPage() {
  const { t } = await getT();
  const [counts, pool, refreshedAt, ranked, uploads] = await Promise.all([
    countAdminUploads(),
    proPoolSize(prisma),
    normsRefreshedAt(prisma),
    prisma.matchPlayer.count({ where: { rankType: { not: null } } }),
    prisma.demoUpload.findMany({
      where: { pro: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        fileName: true,
        proLabel: true,
        status: true,
        error: true,
        createdAt: true,
        match: { select: { id: true, map: true, scoreCT: true, scoreT: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title={t("norms.admin.title")} description={t("norms.admin.description")} />
      <AdminNav failed={counts.failed} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={t("norms.admin.statPool")} value={pool.matches} highlight={pool.matches > 0} />
        <StatCard label={t("norms.admin.statPlayers")} value={pool.players} />
        <StatCard
          label={t("norms.admin.statRanked")}
          value={ranked}
          className="col-span-2 lg:col-span-1"
          hint={refreshedAt ? t("norms.admin.lastRefresh", { date: formatDateTime(refreshedAt) }) : t("norms.admin.neverRefreshed")}
        />
      </div>

      <Card className="space-y-4">
        <CardHeader title={t("norms.admin.upload")} />
        <p className="text-sm text-[var(--text-secondary)]">{t("norms.admin.terms")}</p>
        <ProDemoUpload />
        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-[var(--text-tertiary)]">{t("norms.admin.cliHint")}</p>
          <RefreshNormsButton />
        </div>
      </Card>

      {uploads.length === 0 ? (
        <EmptyState icon={Trophy} title={t("norms.admin.title")} description={t("norms.admin.empty")} />
      ) : (
        <div className="table-scroll rounded-xl border border-[var(--border)]">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("norms.admin.colDemo")}</th>
                <th>{t("norms.admin.colMap")}</th>
                <th>{t("norms.admin.colStatus")}</th>
                <th>{t("norms.admin.colDate")}</th>
                <th aria-label={t("norms.admin.remove")} />
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id}>
                  <td className="max-w-[240px] truncate" title={u.fileName}>
                    {u.proLabel ?? u.fileName}
                  </td>
                  <td className="whitespace-nowrap">
                    {u.match ? (
                      <>
                        {mapDisplayName(u.match.map)}{" "}
                        <span className="font-mono text-[var(--text-tertiary)]">
                          {u.match.scoreCT}:{u.match.scoreT}
                        </span>
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td>
                    <Badge variant={STATUS_VARIANT[u.status] ?? "default"} title={u.error ?? undefined}>
                      {u.status}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs">{formatDateTime(u.createdAt)}</td>
                  <td className="text-right">
                    <RemoveProDemoButton id={u.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-[var(--text-tertiary)]">
        <Link href="/pro" className="text-[var(--accent-hover)] underline-offset-2 hover:underline">
          {t("norms.title")}
        </Link>
      </p>
    </div>
  );
}
