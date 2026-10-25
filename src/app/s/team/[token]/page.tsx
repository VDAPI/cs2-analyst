import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { isShareToken } from "@/lib/sharing/share";
import { getTeamMapReport, teamMaps } from "@/lib/team/load";
import { loadMapLanes } from "@/lib/team/map-lanes-load";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/ui";
import { MapThumb } from "@/components/match";
import { PrintButton } from "@/components/team/print-button";
import { TeamMapAnalysis } from "@/components/team-analysis/team-map-analysis";

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ map?: string }>;
}

export const metadata: Metadata = { title: "Analiza drużyny — CS2 Analyst", robots: { index: false } };

/**
 * /s/team/<token> — a shared team analysis, read-only and without signing in:
 * the owner's team-analysis demos of the shared roster, one map at a time.
 * No replay links or boards (those need the owner's account).
 */
export default async function SharedTeamPage({ params, searchParams }: Props) {
  const { token } = await params;
  const query = await searchParams;
  if (!isShareToken(token)) notFound();
  const share = await prisma.teamShare.findUnique({ where: { token } });
  if (!share || share.revokedAt) notFound();
  const { t } = await getT();

  const maps = await teamMaps(prisma, share.userId, share.steamIds);
  const map = maps.find((m) => m.map === query.map)?.map ?? maps[0]?.map;
  const report = map ? await getTeamMapReport(prisma, share.userId, share.steamIds, map) : null;
  if (map) await loadMapLanes(prisma, map);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeader eyebrow="Analiza drużyny · CS2 Analyst" title={share.title} actions={<PrintButton label="Drukuj / zapisz PDF" />} />
      {maps.length > 0 && (
        <nav aria-label="Mapy" className="flex flex-wrap gap-2 print:hidden">
          {maps.map((m) => (
            <Link
              key={m.map}
              href={`/s/team/${token}?map=${m.map}`}
              aria-current={m.map === map ? "true" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                m.map === map
                  ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
              )}
            >
              <MapThumb map={m.map} size="sm" />
              {mapDisplayName(m.map)} <span className="font-mono text-xs text-[var(--text-tertiary)]">{m.matches}</span>
            </Link>
          ))}
        </nav>
      )}
      {report ? (
        <TeamMapAnalysis report={report} t={t} shared />
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">Brak dem tej drużyny.</p>
      )}
    </main>
  );
}
