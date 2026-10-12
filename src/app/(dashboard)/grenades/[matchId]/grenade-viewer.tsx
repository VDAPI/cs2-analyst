"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Play, X } from "lucide-react";
import { Card, buttonVariants } from "@/components/ui";
import { MapViewport } from "@/components/maps/map-viewport";
import { useCanvasUiScale, useRadarImage } from "@/components/maps/use-canvas";
import { ToolHeader } from "@/components/tools/tool-header";
import { ControlGroup, Segmented, ToolSelect } from "@/components/tools/segmented";
import { CANVAS_COLORS, GRENADE_STYLE, grenadeStyle } from "@/lib/canvas/palette";
import { drawEmptyHint, drawRadarBackground, makeWorldToCanvas, TOOL_CANVAS_SIZE, type RadarConfig } from "@/lib/canvas/radar";
import { sideInRound, type Side } from "@/lib/utils/sideSplit";
import { cn } from "@/lib/utils/cn";

interface PlayerInfo {
  steamId: string;
  name: string;
  team: "CT" | "T";
}

interface GrenadeEvent {
  id: string;
  tick: number;
  round: number;
  throwerSteamId: string;
  throwerName: string;
  type: string;
  throwPos: { x: number; y: number; z: number };
  landPos: { x: number; y: number; z: number };
  damageDealt: number;
  playersFlashed: number;
  duration: number | null;
}

interface PlayerStats {
  steamId: string;
  name: string;
  team: string;
  smokes: number;
  flashes: number;
  hes: number;
  molotovs: number;
  flashEnemies: number;
  utilDamage: number;
}

interface GrenadeViewerProps {
  matchId: string;
  mapName: string;
  mapRaw: string;
  mapConfig: RadarConfig | null;
  players: PlayerInfo[];
  totalRounds: number;
  scoreCT: number;
  scoreT: number;
  /** Side of the team that finished on CT, per round (teamASidesFromScores). */
  teamASideByRound: Record<number, Side>;
}

type SideFilter = "all" | "CT" | "T";

const TYPE_FILTERS = ["SMOKE", "FLASH", "HE", "MOLOTOV"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

const GRENADE_RADIUS: Record<string, number> = {
  SMOKE: 20,
  FLASH: 15,
  HE: 15,
  MOLOTOV: 18,
  INCENDIARY: 18,
  DECOY: 8,
};

const TAP_RADIUS = 30;

function filterKey(type: string): TypeFilter | null {
  if (type === "INCENDIARY") return "MOLOTOV";
  return (TYPE_FILTERS as readonly string[]).includes(type) ? (type as TypeFilter) : null;
}

export function GrenadeViewer({
  matchId,
  mapName,
  mapRaw,
  mapConfig,
  players,
  totalRounds,
  scoreCT,
  scoreT,
  teamASideByRound,
}: GrenadeViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const radar = useRadarImage(mapConfig?.radarImage ?? `/maps/${mapRaw}_radar.png`);
  const worldToCanvas = useMemo(() => makeWorldToCanvas(mapConfig), [mapConfig]);
  const [zoom, setZoom] = useState(1);
  const ui = useCanvasUiScale(canvasRef, zoom);

  const [grenades, setGrenades] = useState<GrenadeEvent[]>([]);
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [showTypes, setShowTypes] = useState<Set<TypeFilter>>(() => new Set(TYPE_FILTERS));
  const [roundFilter, setRoundFilter] = useState("all");
  const [playerFilter, setPlayerFilter] = useState("all");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const params = new URLSearchParams();
    if (roundFilter !== "all") params.set("round", roundFilter);

    fetch(`/api/matches/${matchId}/grenades?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setGrenades(data.grenades ?? []);
        setStats(data.stats ?? []);
      })
      .catch(() => {
        if (!cancelled) setGrenades([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, roundFilter]);

  const teamById = useMemo(() => new Map(players.map((p) => [p.steamId, p.team])), [players]);

  // Sides swap at half time: compare against the side the thrower played in that round.
  const filtered = useMemo(
    () =>
      grenades.filter((g) => {
        const key = filterKey(g.type);
        if (!key || !showTypes.has(key)) return false;
        if (playerFilter !== "all" && g.throwerSteamId !== playerFilter) return false;
        if (sideFilter !== "all") {
          const team = teamById.get(g.throwerSteamId);
          if (team && sideInRound(team, g.round, teamASideByRound, totalRounds) !== sideFilter) return false;
        }
        return true;
      }),
    [grenades, showTypes, playerFilter, sideFilter, teamById, teamASideByRound, totalRounds]
  );

  const selected = filtered.find((g) => g.id === selectedId) ?? null;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    drawRadarBackground(ctx, radar, 0.5, mapName);
    if (filtered.length === 0) {
      drawEmptyHint(ctx, isLoading ? "Ładowanie…" : "Brak granatów dla tych filtrów");
      return;
    }

    // Selected last so it sits on top
    const ordered = selected ? [...filtered.filter((g) => g.id !== selected.id), selected] : filtered;
    for (const g of ordered) {
      const isSel = g.id === selected?.id;
      const dim = selected && !isSel;
      const style = grenadeStyle(g.type);
      const radius = GRENADE_RADIUS[g.type] ?? 10;
      const from = worldToCanvas(g.throwPos.x, g.throwPos.y);
      const to = worldToCanvas(g.landPos.x, g.landPos.y);

      ctx.save();
      ctx.globalAlpha = isSel ? 1 : dim ? 0.2 : 0.6;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = style.line;
      ctx.lineWidth = (isSel ? 3 : 2) * ui;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = isSel ? 0.9 : dim ? 0.15 : 0.45;
      ctx.beginPath();
      ctx.arc(to.x, to.y, isSel ? radius * 1.4 : radius, 0, Math.PI * 2);
      ctx.fillStyle = style.fill;
      ctx.fill();
      ctx.strokeStyle = style.line;
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.stroke();

      ctx.globalAlpha = isSel ? 1 : dim ? 0.2 : 0.5;
      ctx.beginPath();
      ctx.arc(from.x, from.y, (isSel ? 5 : 3) * ui, 0, Math.PI * 2);
      ctx.fillStyle = style.line;
      ctx.fill();

      if (isSel) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(to.x, to.y, radius * 1.4 + 6 * ui, 0, Math.PI * 2);
        ctx.strokeStyle = CANVAS_COLORS.accent;
        ctx.lineWidth = 2;
        ctx.shadowColor = CANVAS_COLORS.accent;
        ctx.shadowBlur = 12;
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [filtered, selected, radar, worldToCanvas, mapName, isLoading, ui]);

  const onTap = ({ x, y }: { x: number; y: number }) => {
    let best: GrenadeEvent | null = null;
    let bestDist = TAP_RADIUS * ui;
    for (const g of filtered) {
      const to = worldToCanvas(g.landPos.x, g.landPos.y);
      const d = Math.hypot(to.x - x, to.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = g;
      }
    }
    setSelectedId(best?.id ?? null);
  };

  const toggleType = (type: TypeFilter) => {
    setShowTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const countByType = (type: TypeFilter) => filtered.filter((g) => filterKey(g.type) === type).length;
  const totalFlashed = filtered.filter((g) => g.type === "FLASH").reduce((s, g) => s + g.playersFlashed, 0);
  const totalDamage = filtered.reduce((s, g) => s + g.damageDealt, 0);

  const ctPlayers = players.filter((p) => p.team === "CT");
  const tPlayers = players.filter((p) => p.team === "T");
  const sortedStats = [...stats].sort(
    (a, b) => b.utilDamage + b.flashEnemies * 10 - (a.utilDamage + a.flashEnemies * 10)
  );

  return (
    <div className="flex flex-col gap-4">
      <ToolHeader
        backHref="/grenades"
        backLabel="Granaty"
        overline="Granaty i utility"
        title={mapName}
        scoreCT={scoreCT}
        scoreT={scoreT}
        loading={isLoading}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,720px)_minmax(260px,1fr)] lg:items-start">
        <div className="min-w-0 space-y-2">
          <MapViewport onZoomChange={setZoom} canvasRef={canvasRef} size={TOOL_CANVAS_SIZE} onTap={onTap} label={`Granaty na mapie ${mapName}`} />

          {selected ? (
            <SelectedGrenade grenade={selected} matchId={matchId} onClose={() => setSelectedId(null)} />
          ) : (
            <p className="text-[13px] text-[var(--text-tertiary)]">
              Dotknij miejsca lądowania granatu albo wybierz go z listy niżej.
            </p>
          )}
        </div>

        <Card className="space-y-5">
          <ControlGroup label="Typy granatów">
            <div className="grid grid-cols-2 gap-1.5">
              {TYPE_FILTERS.map((type) => {
                const style = GRENADE_STYLE[type];
                const active = showTypes.has(type);
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleType(type)}
                    className={cn(
                      "flex min-h-10 items-center gap-2 rounded-lg border px-2.5 text-[13px] font-semibold transition-colors duration-150",
                      active
                        ? "border-[var(--border-hover)] bg-[var(--surface-2)] text-[var(--text-primary)]"
                        : "border-transparent text-[var(--text-disabled)] line-through"
                    )}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: active ? style.token : "var(--surface-4)" }}
                    />
                    {style.label}
                    <span className="ml-auto font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                      {countByType(type)}
                    </span>
                  </button>
                );
              })}
            </div>
          </ControlGroup>

          <ControlGroup label="Runda">
            <ToolSelect value={roundFilter} onChange={(e) => setRoundFilter(e.target.value)} aria-label="Runda">
              <option value="all">Wszystkie rundy</option>
              {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>
                  Runda {r}
                </option>
              ))}
            </ToolSelect>
          </ControlGroup>

          <ControlGroup label="Strona w rundzie">
            <Segmented<SideFilter>
              label="Strona"
              value={sideFilter}
              onChange={setSideFilter}
              options={[
                { value: "all", label: "Obie" },
                { value: "CT", label: "CT", tone: "ct" },
                { value: "T", label: "T", tone: "t" },
              ]}
            />
          </ControlGroup>

          <ControlGroup label="Gracz">
            <ToolSelect value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)} aria-label="Gracz">
              <option value="all">Wszyscy gracze</option>
              {ctPlayers.length > 0 && (
                <optgroup label="Drużyna kończąca jako CT">
                  {ctPlayers.map((p) => (
                    <option key={p.steamId} value={p.steamId}>{p.name}</option>
                  ))}
                </optgroup>
              )}
              {tPlayers.length > 0 && (
                <optgroup label="Drużyna kończąca jako T">
                  {tPlayers.map((p) => (
                    <option key={p.steamId} value={p.steamId}>{p.name}</option>
                  ))}
                </optgroup>
              )}
            </ToolSelect>
          </ControlGroup>

          <div className="grid grid-cols-3 gap-2 border-t border-[var(--divider)] pt-4">
            <SummaryStat label="Granaty" value={filtered.length} />
            <SummaryStat label="Oślepieni" value={totalFlashed} color="var(--flash)" />
            <SummaryStat label="Obrażenia" value={totalDamage} color="var(--he)" />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-0 md:p-0">
          <div className="px-4 pt-4 md:px-5 md:pt-5">
            <h2 className="label-overline text-[var(--text-tertiary)]">Utility graczy (cały mecz)</h2>
          </div>
          <div className="mt-3 overflow-x-auto pb-2">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="bg-[rgba(190,160,255,0.03)] text-left text-[var(--text-tertiary)]">
                  <th className="sticky left-0 z-10 bg-[var(--surface-1)] px-4 py-2 font-semibold">Gracz</th>
                  <th className="px-2 py-2 text-right font-semibold" style={{ color: "var(--smoke)" }} title="Smoke">S</th>
                  <th className="px-2 py-2 text-right font-semibold" style={{ color: "var(--flash)" }} title="Flash">F</th>
                  <th className="px-2 py-2 text-right font-semibold" style={{ color: "var(--he)" }} title="HE">HE</th>
                  <th className="px-2 py-2 text-right font-semibold" style={{ color: "var(--molotov)" }} title="Molotov">M</th>
                  <th className="px-2 py-2 text-right font-semibold" title="Oślepieni wrogowie">Oślep.</th>
                  <th className="px-4 py-2 text-right font-semibold" title="Obrażenia z utility">Obr.</th>
                </tr>
              </thead>
              <tbody>
                {sortedStats.map((s) => {
                  const active = playerFilter === s.steamId;
                  return (
                    <tr
                      key={s.steamId}
                      className={cn(
                        "border-t border-[var(--divider)] transition-colors",
                        active ? "bg-[var(--accent-muted)]" : "hover:bg-[var(--surface-2)]"
                      )}
                    >
                      <td
                        className={cn(
                          "sticky left-0 z-10 max-w-[150px] border-l-2 px-4 py-1",
                          active ? "bg-[var(--surface-3)]" : "bg-[var(--surface-1)]",
                          s.team === "CT" ? "border-l-[rgba(90,169,255,0.6)]" : "border-l-[rgba(255,194,61,0.6)]"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setPlayerFilter(active ? "all" : s.steamId)}
                          className={cn(
                            "min-h-9 w-full truncate text-left font-mono transition-colors",
                            active ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          )}
                        >
                          {s.name}
                        </button>
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{s.smokes}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{s.flashes}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{s.hes}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{s.molotovs}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-[var(--flash)]">{s.flashEnemies}</td>
                      <td className="px-4 py-1 text-right font-mono tabular-nums text-[var(--he)]">{s.utilDamage}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-0 md:p-0">
          <div className="px-4 pt-4 md:px-5 md:pt-5">
            <h2 className="label-overline text-[var(--text-tertiary)]">
              Rzuty <span className="font-mono tabular-nums">({filtered.length})</span>
            </h2>
          </div>
          <ul className="mt-2 max-h-[420px] space-y-0.5 overflow-y-auto px-2 pb-3 md:px-3">
            {filtered.map((g) => {
              const style = grenadeStyle(g.type);
              const isSel = g.id === selectedId;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(isSel ? null : g.id)}
                    aria-pressed={isSel}
                    className={cn(
                      "flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors duration-150",
                      isSel ? "bg-[var(--surface-3)] ring-1 ring-[var(--accent)]" : "hover:bg-[var(--surface-2)]"
                    )}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: style.token }} />
                    <span className="w-8 shrink-0 font-mono tabular-nums text-[var(--text-tertiary)]">R{g.round}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-secondary)]">{g.throwerName}</span>
                    <span className="shrink-0 text-[var(--text-tertiary)]">{style.label}</span>
                    {g.damageDealt > 0 && (
                      <span className="w-9 shrink-0 text-right font-mono tabular-nums text-[var(--he)]">{g.damageDealt}</span>
                    )}
                    {g.playersFlashed > 0 && (
                      <span className="w-9 shrink-0 text-right font-mono tabular-nums text-[var(--flash)]">×{g.playersFlashed}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="label-overline truncate text-[var(--text-tertiary)]">{label}</p>
      <p className="font-mono text-xl font-bold tabular-nums" style={{ color: color ?? "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function SelectedGrenade({
  grenade,
  matchId,
  onClose,
}: {
  grenade: GrenadeEvent;
  matchId: string;
  onClose: () => void;
}) {
  const style = grenadeStyle(grenade.type);
  const effect =
    grenade.damageDealt > 0
      ? `${grenade.damageDealt} obrażeń`
      : grenade.playersFlashed > 0
        ? `oślepił ${grenade.playersFlashed}`
        : grenade.type === "SMOKE"
          ? "zasłona"
          : "bez efektu";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-3 py-2 text-sm">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: style.token }} />
      <span className="font-semibold text-[var(--text-primary)]">{style.label}</span>
      <span className="truncate font-mono text-[var(--text-secondary)]">{grenade.throwerName}</span>
      <span className="font-mono tabular-nums text-[var(--text-tertiary)]">R{grenade.round}</span>
      <span className="text-[var(--text-tertiary)]">{effect}</span>
      <div className="ml-auto flex items-center gap-1">
        <Link
          href={`/replay/${matchId}?round=${grenade.round}&tick=${grenade.tick}`}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          <Play className="h-3.5 w-3.5" />
          W replayu
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij"
          className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
