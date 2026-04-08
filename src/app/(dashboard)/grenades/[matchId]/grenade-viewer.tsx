"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface MapConfigData {
  posX: number;
  posY: number;
  scale: number;
  width: number;
  height: number;
  radarImage: string;
}

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
  mapConfig: MapConfigData | null;
  players: PlayerInfo[];
  totalRounds: number;
  scoreCT: number;
  scoreT: number;
}

const CANVAS_SIZE = 1024;

const GRENADE_COLORS: Record<string, { line: string; fill: string; label: string }> = {
  SMOKE: { line: "#94a3b8", fill: "rgba(148,163,184,0.3)", label: "Smoke" },
  FLASH: { line: "#fde047", fill: "rgba(253,224,71,0.25)", label: "Flash" },
  HE: { line: "#ef4444", fill: "rgba(239,68,68,0.25)", label: "HE" },
  MOLOTOV: { line: "#f97316", fill: "rgba(249,115,22,0.25)", label: "Molotov" },
  INCENDIARY: { line: "#f97316", fill: "rgba(249,115,22,0.25)", label: "Incendiary" },
  DECOY: { line: "#a78bfa", fill: "rgba(167,139,250,0.2)", label: "Decoy" },
};

const GRENADE_RADIUS: Record<string, number> = {
  SMOKE: 20,
  FLASH: 15,
  HE: 15,
  MOLOTOV: 18,
  INCENDIARY: 18,
  DECOY: 8,
};

export function GrenadeViewer({
  matchId,
  mapName,
  mapRaw,
  mapConfig,
  players,
  totalRounds,
  scoreCT,
  scoreT,
}: GrenadeViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [radarImage, setRadarImage] = useState<HTMLImageElement | null>(null);
  const [grenades, setGrenades] = useState<GrenadeEvent[]>([]);
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [showTypes, setShowTypes] = useState<Set<string>>(
    () => new Set(["SMOKE", "FLASH", "HE", "MOLOTOV"])
  );
  const [roundFilter, setRoundFilter] = useState<string>("all");
  const [playerFilter, setPlayerFilter] = useState<string>("all");
  const [sideFilter, setSideFilter] = useState<string>("all");
  const [selectedGrenade, setSelectedGrenade] = useState<string | null>(null);

  // Load radar image
  useEffect(() => {
    const src = mapConfig?.radarImage ?? `/maps/${mapRaw}_radar.png`;
    const img = new Image();
    img.src = src;
    img.onload = () => setRadarImage(img);
  }, [mapConfig?.radarImage, mapRaw]);

  // Fetch grenade data
  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (roundFilter !== "all") params.set("round", roundFilter);

    fetch(`/api/matches/${matchId}/grenades?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setGrenades(data.grenades ?? []);
        setStats(data.stats ?? []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [matchId, roundFilter]);

  // World → canvas coordinates
  const worldToCanvas = useCallback(
    (gameX: number, gameY: number): { x: number; y: number } => {
      if (!mapConfig) {
        return {
          x: ((gameX + 3230) / 5120) * CANVAS_SIZE,
          y: ((1713 - gameY) / 5120) * CANVAS_SIZE,
        };
      }
      return {
        x: ((gameX - mapConfig.posX) / mapConfig.scale) * (CANVAS_SIZE / mapConfig.width),
        y: ((mapConfig.posY - gameY) / mapConfig.scale) * (CANVAS_SIZE / mapConfig.height),
      };
    },
    [mapConfig]
  );

  // Filter grenades client-side
  const filteredGrenades = grenades.filter((g) => {
    if (!showTypes.has(g.type) && g.type !== "INCENDIARY") return false;
    if (g.type === "INCENDIARY" && !showTypes.has("MOLOTOV")) return false;
    if (playerFilter !== "all" && g.throwerSteamId !== playerFilter) return false;
    if (sideFilter !== "all") {
      const player = players.find((p) => p.steamId === g.throwerSteamId);
      if (player && player.team !== sideFilter) return false;
    }
    return true;
  });

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, w, h);

    // Radar
    if (radarImage) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.filter = "grayscale(100%)";
      ctx.drawImage(radarImage, 0, 0, w, h);
      ctx.restore();
    }

    if (filteredGrenades.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.font = '16px "Geist Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No grenades for current filters", w / 2, h / 2);
      return;
    }

    // Draw grenades
    for (const g of filteredGrenades) {
      const isSelected = selectedGrenade === g.id;
      const colors = GRENADE_COLORS[g.type] ?? GRENADE_COLORS.DECOY;
      const radius = GRENADE_RADIUS[g.type] ?? 10;

      const from = worldToCanvas(g.throwPos.x, g.throwPos.y);
      const to = worldToCanvas(g.landPos.x, g.landPos.y);

      const alpha = isSelected ? 1 : 0.6;

      // Trajectory line (dashed)
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Landing circle
      ctx.save();
      ctx.globalAlpha = isSelected ? 0.8 : 0.4;
      ctx.beginPath();
      ctx.arc(to.x, to.y, isSelected ? radius * 1.4 : radius, 0, Math.PI * 2);
      ctx.fillStyle = colors.fill;
      ctx.fill();
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();
      ctx.restore();

      // Throw position dot
      ctx.beginPath();
      ctx.arc(from.x, from.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = colors.line;
      ctx.globalAlpha = alpha * 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Selected: show label
      if (isSelected) {
        const label = `${g.throwerName} — ${colors.label}`;
        const detail = g.damageDealt > 0 ? `${g.damageDealt} dmg` : g.playersFlashed > 0 ? `${g.playersFlashed} flashed` : "";

        ctx.font = '12px "Geist Mono", monospace';
        ctx.textAlign = "center";

        // Label background
        const labelWidth = ctx.measureText(label).width + 12;
        ctx.fillStyle = "rgba(15,15,18,0.9)";
        ctx.fillRect(to.x - labelWidth / 2, to.y - radius * 1.4 - 28, labelWidth, detail ? 28 : 18);

        ctx.fillStyle = colors.line;
        ctx.fillText(label, to.x, to.y - radius * 1.4 - 16);
        if (detail) {
          ctx.font = '10px "Geist Mono", monospace';
          ctx.fillStyle = "#fafafa";
          ctx.fillText(detail, to.x, to.y - radius * 1.4 - 4);
        }
      }
    }
  }, [filteredGrenades, radarImage, worldToCanvas, selectedGrenade]);

  const toggleType = (type: string) => {
    setShowTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const ctPlayers = players.filter((p) => p.team === "CT");
  const tPlayers = players.filter((p) => p.team === "T");

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/grenades"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            {mapName} — Grenades
          </h1>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-[var(--ct-blue)]">{scoreCT}</span>
            <span className="text-[var(--text-disabled)]">:</span>
            <span className="font-mono text-lg font-bold text-[var(--t-gold)]">{scoreT}</span>
          </div>
        </div>
        {isLoading && (
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            <span className="text-xs text-[var(--text-tertiary)]">Loading...</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Filter Sidebar */}
        <div className="flex w-[220px] flex-shrink-0 flex-col gap-3 overflow-y-auto">
          {/* Grenade type toggles */}
          <ControlPanel label="Grenade Types">
            <div className="space-y-1.5">
              {(["SMOKE", "FLASH", "HE", "MOLOTOV"] as const).map((type) => {
                const colors = GRENADE_COLORS[type];
                const active = showTypes.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                      active
                        ? "bg-[var(--surface-2)] text-[var(--text-primary)]"
                        : "text-[var(--text-disabled)] line-through"
                    }`}
                  >
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: active ? colors.line : "var(--surface-3)" }}
                    />
                    {colors.label}
                    <span className="ml-auto font-mono text-[10px] text-[var(--text-tertiary)]">
                      {filteredGrenades.filter((g) => g.type === type || (type === "MOLOTOV" && g.type === "INCENDIARY")).length}
                    </span>
                  </button>
                );
              })}
            </div>
          </ControlPanel>

          {/* Round selector */}
          <ControlPanel label="Round">
            <select
              value={roundFilter}
              onChange={(e) => setRoundFilter(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="all">All Rounds</option>
              {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>
                  Round {r}
                </option>
              ))}
            </select>
          </ControlPanel>

          {/* Side filter */}
          <ControlPanel label="Side">
            <div className="flex gap-1">
              {(["all", "CT", "T"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSideFilter(s)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-150 ${
                    sideFilter === s
                      ? s === "CT"
                        ? "bg-[var(--ct-blue-muted)] text-[var(--ct-blue)]"
                        : s === "T"
                          ? "bg-[var(--t-gold-muted)] text-[var(--t-gold)]"
                          : "bg-[var(--accent-muted)] text-[var(--accent)]"
                      : "text-[var(--text-tertiary)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {s === "all" ? "All" : s}
                </button>
              ))}
            </div>
          </ControlPanel>

          {/* Player filter */}
          <ControlPanel label="Player">
            <select
              value={playerFilter}
              onChange={(e) => setPlayerFilter(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="all">All Players</option>
              {ctPlayers.length > 0 && (
                <optgroup label="CT">
                  {ctPlayers.map((p) => (
                    <option key={p.steamId} value={p.steamId}>{p.name}</option>
                  ))}
                </optgroup>
              )}
              {tPlayers.length > 0 && (
                <optgroup label="T">
                  {tPlayers.map((p) => (
                    <option key={p.steamId} value={p.steamId}>{p.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </ControlPanel>

          {/* Summary */}
          <ControlPanel label="Summary">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Total grenades</span>
                <span className="font-mono text-[var(--text-primary)]">{filteredGrenades.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Enemies flashed</span>
                <span className="font-mono text-[#fde047]">
                  {filteredGrenades.filter((g) => g.type === "FLASH").reduce((s, g) => s + g.playersFlashed, 0)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Utility damage</span>
                <span className="font-mono text-[#ef4444]">
                  {filteredGrenades.reduce((s, g) => s + g.damageDealt, 0)}
                </span>
              </div>
            </div>
          </ControlPanel>
        </div>

        {/* Canvas */}
        <div className="relative aspect-square max-h-[700px] max-w-[700px] flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border)] shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="h-full w-full"
          />
        </div>

        {/* Right panel: Stats + Event list */}
        <div className="flex min-w-[280px] flex-1 flex-col gap-3 overflow-hidden">
          {/* Per-player stats */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Player Utility Stats
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.04)] text-[var(--text-tertiary)]">
                    <th className="pb-1.5 text-left font-medium">Player</th>
                    <th className="pb-1.5 text-right font-medium" style={{ color: "#94a3b8" }}>S</th>
                    <th className="pb-1.5 text-right font-medium" style={{ color: "#fde047" }}>F</th>
                    <th className="pb-1.5 text-right font-medium" style={{ color: "#ef4444" }}>HE</th>
                    <th className="pb-1.5 text-right font-medium" style={{ color: "#f97316" }}>M</th>
                    <th className="pb-1.5 text-right font-medium">Flsh</th>
                    <th className="pb-1.5 text-right font-medium">Dmg</th>
                  </tr>
                </thead>
                <tbody>
                  {stats
                    .filter((s) => sideFilter === "all" || s.team === sideFilter)
                    .sort((a, b) => (b.utilDamage + b.flashEnemies * 10) - (a.utilDamage + a.flashEnemies * 10))
                    .map((s) => (
                      <tr
                        key={s.steamId}
                        className="border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]"
                      >
                        <td className="py-1.5">
                          <button
                            onClick={() => setPlayerFilter(playerFilter === s.steamId ? "all" : s.steamId)}
                            className={`text-left transition-colors ${
                              playerFilter === s.steamId
                                ? "text-[var(--accent)]"
                                : s.team === "CT"
                                  ? "text-[var(--ct-blue)] hover:text-[var(--text-primary)]"
                                  : "text-[var(--t-gold)] hover:text-[var(--text-primary)]"
                            }`}
                          >
                            {s.name}
                          </button>
                        </td>
                        <td className="py-1.5 text-right font-mono">{s.smokes}</td>
                        <td className="py-1.5 text-right font-mono">{s.flashes}</td>
                        <td className="py-1.5 text-right font-mono">{s.hes}</td>
                        <td className="py-1.5 text-right font-mono">{s.molotovs}</td>
                        <td className="py-1.5 text-right font-mono text-[#fde047]">{s.flashEnemies}</td>
                        <td className="py-1.5 text-right font-mono text-[#ef4444]">{s.utilDamage}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Grenade event list */}
          <div className="flex-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
            <div className="p-4 pb-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                Events ({filteredGrenades.length})
              </p>
            </div>
            <div className="max-h-[400px] overflow-y-auto px-4 pb-4">
              <div className="space-y-1">
                {filteredGrenades.map((g) => {
                  const colors = GRENADE_COLORS[g.type] ?? GRENADE_COLORS.DECOY;
                  const isSelected = selectedGrenade === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGrenade(isSelected ? null : g.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-all duration-150 ${
                        isSelected
                          ? "bg-[var(--surface-3)] ring-1 ring-[var(--accent)]"
                          : "hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      <div
                        className="h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: colors.line }}
                      />
                      <span className="font-mono text-[10px] text-[var(--text-disabled)]">R{g.round}</span>
                      <span className="truncate text-[var(--text-secondary)]">{g.throwerName}</span>
                      <span className="ml-auto flex-shrink-0 text-[var(--text-tertiary)]">
                        {colors.label}
                      </span>
                      {g.damageDealt > 0 && (
                        <span className="flex-shrink-0 font-mono text-[10px] text-[#ef4444]">
                          {g.damageDealt}
                        </span>
                      )}
                      {g.playersFlashed > 0 && (
                        <span className="flex-shrink-0 font-mono text-[10px] text-[#fde047]">
                          {g.playersFlashed}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      {label && (
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}
