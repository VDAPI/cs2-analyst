import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { getMechanicsStats } from "@/lib/analysis/persist-mechanics";
import { pct, type MovementMoment, type WeaponMechanics } from "@/lib/analysis/movement";
import { getAimStats } from "@/lib/analysis/persist-aim";
import type { AimMomentType } from "@/lib/analysis/aim";
import { AimSection, type AimRow } from "./aim-section";
import { cn } from "@/lib/utils/cn";

interface Props {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ player?: string; aim?: string }>;
}

const WEAPON_LABEL: Record<string, string> = {
  glock: "Glock-18", hkp2000: "P2000", usp_silencer: "USP-S", p250: "P250",
  elite: "Dual Berettas", fiveseven: "Five-SeveN", tec9: "Tec-9", cz75a: "CZ75-Auto",
  deagle: "Desert Eagle", revolver: "R8 Revolver", mac10: "MAC-10", mp9: "MP9",
  mp7: "MP7", mp5sd: "MP5-SD", ump45: "UMP-45", p90: "P90", bizon: "PP-Bizon",
  ak47: "AK-47", m4a1: "M4A4", m4a1_silencer: "M4A1-S", galilar: "Galil AR",
  famas: "FAMAS", sg556: "SG 553", aug: "AUG", awp: "AWP", ssg08: "SSG 08",
  scar20: "SCAR-20", g3sg1: "G3SG1", nova: "Nova", xm1014: "XM1014",
  mag7: "MAG-7", sawedoff: "Sawed-Off", m249: "M249", negev: "Negev",
};
const weaponLabel = (w: string) => WEAPON_LABEL[w] ?? w;

const AIM_FILTERS = new Set<AimMomentType>([
  "crosshair", "reaction", "spray", "overflick", "dry_peek", "noise", "jump", "air_shot", "reload",
]);

const fmtPct = (v: number | null) => (v == null ? "–" : `${v.toFixed(0)}%`);

/** Share of engagement first shots fired while moving: lower is better. */
function movingTone(v: number | null): string {
  if (v == null) return "text-[var(--text-tertiary)]";
  if (v <= 10) return "text-[var(--good)]";
  if (v <= 25) return "text-[var(--warning)]";
  return "text-[var(--mistake)]";
}

function fmtRoundTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default async function MechanicsPage({ params, searchParams }: Props) {
  const { matchId } = await params;
  const { player, aim: aimFilter } = await searchParams;
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

  const [stats, aimStats] = await Promise.all([
    getMechanicsStats(prisma, matchId),
    getAimStats(prisma, matchId),
  ]);
  const aimOf = new Map(
    aimStats.map((a) => [a.steamId, a as unknown as AimRow])
  );
  const nameOf = new Map(match.players.map((p) => [p.steamId, p.name]));
  const teamOf = new Map(match.players.map((p) => [p.steamId, p.team as "CT" | "T"]));
  const rows = stats
    .filter((s) => nameOf.has(s.steamId))
    .map((s) => ({
      ...s,
      name: nameOf.get(s.steamId)!,
      team: teamOf.get(s.steamId)!,
      movingFirstPct: pct(s.firstShotsMoving, s.firstShots),
      movingSprayPct: pct(s.sprayShotsMoving, s.sprayShots),
      firstAccPct: pct(s.firstShotHits, s.firstShots),
      hsPct: pct(s.headHits, s.hits),
      weaponRows: s.weapons as unknown as WeaponMechanics[],
      momentRows: s.moments as unknown as MovementMoment[],
      aim: aimOf.get(s.steamId) ?? null,
    }))
    .sort((a, b) => (a.team === b.team ? a.name.localeCompare(b.name) : a.team === "CT" ? -1 : 1));

  const selected =
    rows.find((r) => r.steamId === player) ??
    rows.find((r) => r.steamId === session.user.steamId) ??
    [...rows].sort((a, b) => b.shots - a.shots)[0];

  return (
    <div className="min-w-0 space-y-6">
      <Link
        href={`/matches/${matchId}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Wróć do meczu
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Mechanika
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {mapDisplayName(match.map)} <span className="font-mono">{match.scoreCT}:{match.scoreT}</span>
          {" — "}ruch przy strzale, celowanie i pojedynki.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--text-secondary)]">
          Brak danych o strzałach dla tego meczu. Pojawią się, gdy zapiszą się dane replaya
          (wgraj demo ponownie, jeśli mecz był analizowany wcześniej).
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Wszyscy gracze</h2>
              <p className="text-xs text-[var(--text-tertiary)]">Dotknij gracza, żeby zobaczyć bronie i momenty.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-[var(--border)] text-left text-xs font-medium uppercase text-[var(--text-tertiary)]">
                    <th className="px-4 py-2.5 sm:px-5">Gracz</th>
                    <th className="px-3 py-2.5 text-center" title="Pierwsze strzały pojedynków oddane w ruchu">1. w ruchu</th>
                    <th className="px-3 py-2.5 text-center" title="Strzały w serii oddane w ruchu">Seria w ruchu</th>
                    <th className="px-3 py-2.5 text-center" title="Średni czas counter-strafe">Strafe</th>
                    <th className="px-3 py-2.5 text-center" title="Celność pierwszej kuli w pojedynkach">1. kula</th>
                    <th className="px-3 py-2.5 text-center" title="Odsetek trafień w głowę">HS</th>
                    <th className="px-3 py-2.5 text-center" title="Mediana kąta celownika do głowy wroga w chwili, gdy stał się widoczny">Crosshair</th>
                    <th className="px-3 py-2.5 text-center" title="Mediana czasu reakcji">Reakcja</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.steamId}
                      className={cn(
                        "border-t border-[var(--border)] transition-colors hover:bg-[rgba(255,255,255,0.02)]",
                        r.steamId === selected?.steamId && "bg-[rgba(255,255,255,0.03)]"
                      )}
                    >
                      <td className="px-4 py-2.5 sm:px-5">
                        <Link
                          href={`/mechanics/${matchId}?player=${r.steamId}`}
                          scroll={false}
                          className="flex items-center gap-2 font-medium text-[var(--text-primary)] hover:underline"
                        >
                          <span
                            className="h-2 w-2 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: r.team === "CT" ? "var(--ct-blue)" : "var(--t-gold)" }}
                          />
                          <span className="max-w-[120px] truncate sm:max-w-none">{r.name}</span>
                        </Link>
                      </td>
                      <td className={cn("px-3 py-2.5 text-center font-mono font-semibold", movingTone(r.movingFirstPct))}>
                        {fmtPct(r.movingFirstPct)}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-[var(--text-secondary)]">
                        {fmtPct(r.movingSprayPct)}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-[var(--text-secondary)]">
                        {r.counterStrafeAvgMs == null ? "–" : `${Math.round(r.counterStrafeAvgMs)} ms`}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-[var(--text-secondary)]">
                        {fmtPct(r.firstAccPct)}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-[var(--text-secondary)]">
                        {fmtPct(r.hsPct)}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-[var(--text-secondary)]">
                        {r.aim?.crosshairMedianDeg == null ? "–" : `${r.aim.crosshairMedianDeg}°`}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-[var(--text-secondary)]">
                        {r.aim?.reactionMedianMs == null ? "–" : `${r.aim.reactionMedianMs} ms`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {selected && <PlayerDetail matchId={matchId} p={selected} />}

          {selected?.aim && (
            <AimSection
              matchId={matchId}
              steamId={selected.steamId}
              aim={selected.aim}
              filter={AIM_FILTERS.has(aimFilter as AimMomentType) ? (aimFilter as AimMomentType) : null}
            />
          )}

          <p className="text-xs text-[var(--text-tertiary)]">
            Strzał jest „w ruchu”, gdy prędkość przekracza 34% maksymalnej prędkości broni (od tego
            progu CS2 dodaje rozrzut za ruch) albo gracz jest w powietrzu. Pojedynek to seria, w której
            trafiłeś wroga albo wróg trafił ciebie do 2 s wcześniej; strzały w próżnię są pomijane.
            Counter-strafe to czas od prędkości biegu (60% maks.) do prędkości celnej, liczony z próbek
            co 4 ticki, więc dokładność to ok. ±20 ms. AWP i SSG ze scope&apos;em mają próg jak bez scope&apos;a.
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Celowanie: moment pojawienia się wroga bierzemy z widoczności zapisanej w grze (kto kogo widzi), a w
            starszych meczach przybliżamy go polem widzenia. Czas reakcji to start ruchu celownika w stronę wroga albo
            pierwszy strzał, z dokładnością ok. ±30 ms. Bieg i skoki liczymy tylko przy wrogu, o którym twój team
            wiedział, albo gdy skończyły się trafieniem. Progi są wstępne, zastąpią je normy z meczów pro.
          </p>
        </>
      )}
    </div>
  );
}

function PlayerDetail({
  matchId,
  p,
}: {
  matchId: string;
  p: {
    name: string;
    team: "CT" | "T";
    shots: number;
    movingShots: number;
    firstShots: number;
    firstShotsMoving: number;
    counterStrafes: number;
    counterStrafeAvgMs: number | null;
    counterStrafeMedianMs: number | null;
    shotBeforeStop: number;
    movingFirstPct: number | null;
    firstAccPct: number | null;
    hsPct: number | null;
    weaponRows: WeaponMechanics[];
    momentRows: MovementMoment[];
  };
}) {
  const tiles = [
    {
      label: "Pierwsze strzały w ruchu",
      value: fmtPct(p.movingFirstPct),
      sub: `${p.firstShotsMoving} z ${p.firstShots} pojedynków`,
      tone: movingTone(p.movingFirstPct),
    },
    {
      label: "Counter-strafe",
      value: p.counterStrafeAvgMs == null ? "–" : `${Math.round(p.counterStrafeAvgMs)} ms`,
      sub:
        p.counterStrafeMedianMs == null
          ? "brak zmierzonych zatrzymań"
          : `mediana ${Math.round(p.counterStrafeMedianMs)} ms · ${p.counterStrafes} zatrzymań`,
      tone: "text-[var(--text-primary)]",
    },
    {
      label: "Strzał przed zatrzymaniem",
      value: String(p.shotBeforeStop),
      sub: "strzał w trakcie hamowania",
      tone: p.shotBeforeStop > 0 ? "text-[var(--warning)]" : "text-[var(--text-primary)]",
    },
    {
      label: "Celność 1. kuli",
      value: fmtPct(p.firstAccPct),
      sub: `HS z trafień ${fmtPct(p.hsPct)}`,
      tone: "text-[var(--text-primary)]",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{p.name}</h2>
        <Badge variant={p.team === "CT" ? "ct" : "t"}>{p.team}</Badge>
        <span className="font-mono text-xs text-[var(--text-tertiary)]">
          {p.shots} strzałów · {fmtPct(pct(p.movingShots, p.shots))} w ruchu łącznie
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-xs text-[var(--text-tertiary)]">{t.label}</p>
            <p className={cn("mt-1 font-mono text-2xl font-semibold", t.tone)}>{t.value}</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{t.sub}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Według broni</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-[var(--border)] text-left text-xs font-medium uppercase text-[var(--text-tertiary)]">
                <th className="px-4 py-2.5 sm:px-5">Broń</th>
                <th className="px-3 py-2.5 text-center">Strzały</th>
                <th className="px-3 py-2.5 text-center">W ruchu</th>
                <th className="px-3 py-2.5 text-center">1. w ruchu</th>
                <th className="px-3 py-2.5 text-center">1. kula</th>
                <th className="px-3 py-2.5 text-center">Celność</th>
                <th className="px-3 py-2.5 text-center">HS</th>
              </tr>
            </thead>
            <tbody>
              {p.weaponRows.map((w) => {
                const movingFirst = pct(w.firstShotsMoving, w.firstShots);
                return (
                  <tr key={w.weapon} className="border-t border-[var(--border)]">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-[var(--text-primary)] sm:px-5">
                      {weaponLabel(w.weapon)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-[var(--text-secondary)]">{w.shots}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-[var(--text-secondary)]">
                      {fmtPct(pct(w.movingShots, w.shots))}
                    </td>
                    <td className={cn("px-3 py-2.5 text-center font-mono font-semibold", movingTone(movingFirst))}>
                      {fmtPct(movingFirst)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-[var(--text-secondary)]">
                      {fmtPct(pct(w.firstShotHits, w.firstShots))}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-[var(--text-secondary)]">
                      {fmtPct(pct(w.hits, w.shots))}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-[var(--text-secondary)]">
                      {fmtPct(pct(w.headHits, w.hits))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
          Pojedynki zaczęte w ruchu <span className="font-mono text-[var(--text-tertiary)]">({p.momentRows.length})</span>
        </h3>
        {p.momentRows.length === 0 ? (
          <Card className="p-4 text-sm text-[var(--text-secondary)]">
            Każdy pojedynek zaczęty w miejscu. Tak trzymaj.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {p.momentRows.map((m) => (
              <Link
                key={`${m.roundNumber}-${m.tick}`}
                href={`/replay/${matchId}?round=${m.roundNumber}&tick=${m.tick}`}
                className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 transition-colors hover:border-[var(--border-hover)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-primary)]">
                    <span className="font-mono">R{m.roundNumber}</span>
                    <span className="mx-1.5 text-[var(--text-disabled)]">·</span>
                    <span className="font-mono">{fmtRoundTime(m.roundTime)}</span>
                    <span className="mx-1.5 text-[var(--text-disabled)]">·</span>
                    {weaponLabel(m.weapon)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    <span className="font-mono text-[var(--mistake)]">{m.speed}</span>
                    <span className="font-mono"> / {m.threshold} u/s</span>
                    {m.airborne && " · w powietrzu"}
                    {m.strafeMs != null && m.strafeMs > 0 && (
                      <span className="font-mono"> · {m.strafeMs} ms hamowania</span>
                    )}
                    {" · "}
                    <span className={m.hit ? "text-[var(--good)]" : "text-[var(--text-tertiary)]"}>
                      {m.hit ? "trafienie" : "pudło"}
                    </span>
                  </p>
                </div>
                <Play className="h-4 w-4 flex-shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
