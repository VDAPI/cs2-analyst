import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminAnalysesList } from "@/components/admin/admin-analyses-list";
import { countAdminUploads, getAdminUploads, type AdminUploadFilter } from "@/lib/admin/data";
import { cn } from "@/lib/utils/cn";
import { requireAdminPage } from "@/lib/admin/session";

const FILTERS: { key: AdminUploadFilter; label: string; empty: string }[] = [
  { key: "failed", label: "Nieudane", empty: "Brak nieudanych analiz" },
  { key: "stuck", label: "Zawieszone", empty: "Nic nie wisi w kolejce" },
  { key: "all", label: "Wszystkie", empty: "Nikt jeszcze nic nie analizował" },
];

export default async function AdminAnalysesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireAdminPage();
  const { filter: raw } = await searchParams;
  const filter = FILTERS.find((f) => f.key === raw) ?? FILTERS[0];
  const [rows, counts] = await Promise.all([getAdminUploads(filter.key), countAdminUploads()]);
  const badge: Partial<Record<AdminUploadFilter, number>> = { failed: counts.failed, stuck: counts.stuck };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Analizy"
        description="Nieudane i zawieszone analizy wszystkich graczy. Ponowienie z panelu nie liczy się do limitu gracza."
      />
      <AdminNav failed={counts.failed} />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtr analiz">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/analyses?filter=${f.key}`}
            role="tab"
            aria-selected={f.key === filter.key}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
              f.key === filter.key
                ? "border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent-hover)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
            )}
          >
            {f.label}
            {badge[f.key] ? <span className="font-mono text-xs tabular-nums">{badge[f.key]}</span> : null}
          </Link>
        ))}
      </div>

      <AdminAnalysesList rows={rows} emptyTitle={filter.empty} />
      {rows.length >= 100 && (
        <p className="text-xs text-[var(--text-tertiary)]">Pokazano 100 ostatnio zmienionych.</p>
      )}
    </div>
  );
}
