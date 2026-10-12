import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { ClipboardCheck, Play } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { ShareButton } from "@/components/share/share-button";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import { getFindings } from "@/lib/findings/persist";
import { loadPlayerReport, reportClipContext } from "@/lib/findings/player-report";
import { toFindingView } from "@/lib/findings/view";
import { ReportBody } from "./report-body";

interface Props {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ player?: string }>;
}

export default async function ReportPage({ params, searchParams }: Props) {
  const { matchId } = await params;
  const { player } = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  const match = await prisma.match.findFirst({
    where: { id: matchId, upload: { userId: session.user.id } },
    select: {
      id: true,
      map: true,
      scoreCT: true,
      scoreT: true,
      players: { select: { steamId: true, name: true, team: true } },
    },
  });
  if (!match) notFound();

  const all = (await getFindings(prisma, matchId)).map(toFindingView);
  const nameOf = new Map(match.players.map((p) => [p.steamId, p.name]));
  const players = [...match.players].sort((a, b) =>
    a.team === b.team ? a.name.localeCompare(b.name) : a.team === "CT" ? -1 : 1
  );
  const countOf = new Map<string, number>();
  for (const f of all) if (f.severity !== "low") countOf.set(f.steamId, (countOf.get(f.steamId) ?? 0) + 1);

  const selected =
    players.find((p) => p.steamId === player) ??
    players.find((p) => p.steamId === session.user.steamId) ??
    [...players].sort((a, b) => (countOf.get(b.steamId) ?? 0) - (countOf.get(a.steamId) ?? 0))[0];

  const { report, hasData } = selected
    ? await loadPlayerReport(prisma, matchId, selected.steamId, all)
    : { report: null, hasData: false };
  const ctx = reportClipContext(matchId, match.map);

  return (
    <div className="min-w-0 space-y-8">
      <PageHeader
        back={{ href: `/matches/${matchId}`, label: "Wróć do meczu" }}
        eyebrow="Raport meczu"
        title="Co poprawić"
        description={
          <>
            {mapDisplayName(match.map)}{" "}
            <span className="font-mono tabular-nums">
              {match.scoreCT}:{match.scoreT}
            </span>
            {selected && <> · {selected.name}</>}. Najpierw trzy rzeczy, które najbardziej kosztują cię rundy, potem
            wszystkie błędy według kategorii.
          </>
        }
        actions={
          selected && (
            <>
              {hasData && <ShareButton request={{ kind: "report", matchId, steamId: selected.steamId }} />}
              <Link
              href={`/replay/${matchId}?player=${selected.steamId}`}
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
                Replay z błędami
              </Link>
            </>
          )
        }
      />

      {/* Player picker */}
      <nav aria-label="Gracz" className="-mx-4 md:mx-0">
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 md:flex-wrap md:overflow-visible md:px-0">
          {players.map((p) => {
            const active = p.steamId === selected?.steamId;
            const n = countOf.get(p.steamId) ?? 0;
            return (
              <Link
                key={p.steamId}
                href={`/report/${matchId}?player=${p.steamId}`}
                scroll={false}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                  active
                    ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: p.team === "CT" ? "var(--ct-blue)" : "var(--t-gold)" }}
                  aria-hidden
                />
                <span className="max-w-[140px] truncate">{p.name}</span>
                {p.steamId === session.user.steamId && <span className="text-xs text-[var(--accent-2)]">ty</span>}
                <span className="font-mono text-xs text-[var(--text-tertiary)]" title="Błędy do poprawy i poważne">
                  {n}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {!hasData || !report ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Brak danych do raportu"
          description="Raport powstaje z danych replaya zapisanych przy analizie. Ten mecz był analizowany, zanim je zapisywaliśmy; wgraj demo ponownie, a raport pojawi się automatycznie."
          action={
            <Link href="/upload" className={buttonVariants({ variant: "cta" })}>
              Wgraj demo
            </Link>
          }
        />
      ) : (
        <>
          <ReportBody report={report} ctx={ctx} nameOf={nameOf} />
        </>
      )}
    </div>
  );
}
