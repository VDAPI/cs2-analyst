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
import { cn } from "@/lib/utils/cn";

interface Props {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ player?: string }>;
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

const fmtPct = (v: number | null) => (v == null ? "–" : `${v.toFixed(0)}%`);

/** Share of engagement first shots fired while moving: lower is better. */
function movingTone(v: number | null): string {
  if (v == null) return "text-[var(--text-tertiary)]";
  if (v <= 10) return "text-[var(--success)]";
  if (v <= 25) return "text-[var(--warning)]";
  return "text-[var(--error)]";
}

function fmtRoundTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default async function MechanicsPage({ params, searchParams }: Props) {
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

  const stats = await getMechanicsStats(prisma, matchId);
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
        Back to match
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Movement &amp; counter-strafe
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {mapDisplayName(match.map)} <span className="font-mono">{match.scoreCT}:{match.scoreT}</span>
          {" — "}was the player still when the duel&apos;s first bullet left the gun?
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--text-secondary)]">
          No shot data for this match yet. It appears once the replay data is stored (re-upload
          the demo if this match was analysed before replay data existed).
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">All players</h2>
              <p className="text-xs text-[var(--text-tertiary)]">Tap a player for weapons and moments.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-[var(--border)] text-left text-xs font-medium uppercase text-[var(--text-tertiary)]">
                    <th className="px-4 py-2.5 sm:px-5">Player</th>
                    <th className="px-3 py-2.5 text-center" title="First shots of duels fired while moving">Moving 1st</th>
                    <th className="px-3 py-2.5 text-center" title="Spray shots fired while moving">Moving spray</th>
                    <th className="px-3 py-2.5 text-center" title="Average counter-strafe time">Strafe</th>
                    <th className="px-3 py-2.5 text-center" title="First-bullet hit rate in duels">1st hit</th>
                    <th className="px-3 py-2.5 text-center" title="Headshot share of hits">HS</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {selected && <PlayerDetail matchId={matchId} p={selected} />}

          <p className="text-xs text-[var(--text-tertiary)]">
            A shot counts as moving above 34% of the weapon&apos;s max speed (where CS2 adds movement
            inaccuracy) or in the air. Duels are bursts where you hit an enemy or were hit up to 2 s
            before; spam into nothing is left out. Counter-strafe is the time from running speed
            (60% of max) to accurate speed, from 4-tick samples, so it is precise to roughly ±20 ms.
            Scoped AWP/SSG use the unscoped threshold.
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
      label: "Moving first shots",
      value: fmtPct(p.movingFirstPct),
      sub: `${p.firstShotsMoving} of ${p.firstShots} duels`,
      tone: movingTone(p.movingFirstPct),
    },
    {
      label: "Counter-strafe",
      value: p.counterStrafeAvgMs == null ? "–" : `${Math.round(p.counterStrafeAvgMs)} ms`,
      sub:
        p.counterStrafeMedianMs == null
          ? "no stops measured"
          : `median ${Math.round(p.counterStrafeMedianMs)} ms · ${p.counterStrafes} stops`,
      tone: "text-[var(--text-primary)]",
    },
    {
      label: "Shot before stopping",
      value: String(p.shotBeforeStop),
      sub: "fired while still braking",
      tone: p.shotBeforeStop > 0 ? "text-[var(--warning)]" : "text-[var(--text-primary)]",
    },
    {
      label: "First-bullet hits",
      value: fmtPct(p.firstAccPct),
      sub: `HS of hits ${fmtPct(p.hsPct)}`,
      tone: "text-[var(--text-primary)]",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{p.name}</h2>
        <Badge variant={p.team === "CT" ? "ct" : "t"}>{p.team}</Badge>
        <span className="font-mono text-xs text-[var(--text-tertiary)]">
          {p.shots} shots · {fmtPct(pct(p.movingShots, p.shots))} moving overall
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
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Per weapon</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-[var(--border)] text-left text-xs font-medium uppercase text-[var(--text-tertiary)]">
                <th className="px-4 py-2.5 sm:px-5">Weapon</th>
                <th className="px-3 py-2.5 text-center">Shots</th>
                <th className="px-3 py-2.5 text-center">Moving</th>
                <th className="px-3 py-2.5 text-center">Moving 1st</th>
                <th className="px-3 py-2.5 text-center">1st hit</th>
                <th className="px-3 py-2.5 text-center">Hit</th>
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
          Duels opened while moving <span className="font-mono text-[var(--text-tertiary)]">({p.momentRows.length})</span>
        </h3>
        {p.momentRows.length === 0 ? (
          <Card className="p-4 text-sm text-[var(--text-secondary)]">
            Every duel opened standing still. Nice.
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
                    <span className="font-mono text-[var(--error)]">{m.speed}</span>
                    <span className="font-mono"> / {m.threshold} u/s</span>
                    {m.airborne && " · in the air"}
                    {m.strafeMs != null && m.strafeMs > 0 && (
                      <span className="font-mono"> · {m.strafeMs} ms into the stop</span>
                    )}
                    {" · "}
                    <span className={m.hit ? "text-[var(--success)]" : "text-[var(--text-tertiary)]"}>
                      {m.hit ? "hit" : "miss"}
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
