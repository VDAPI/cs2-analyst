"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, X } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, StatCard, buttonVariants } from "@/components/ui";
import { ToolHeader } from "@/components/tools/tool-header";
import { Segmented } from "@/components/tools/segmented";
import { CANVAS_COLORS } from "@/lib/canvas/palette";
import { BUY_TYPE_COLORS, BUY_TYPE_LABELS, type BuyTypeKey } from "@/lib/utils/buyType";
import { cn } from "@/lib/utils/cn";

interface RoundEconomy {
  round: number;
  winner: "CT" | "T";
  winReason: string;
  ctScore: number;
  tScore: number;
  ctEquipVal: number;
  tEquipVal: number;
  ctMoney: number;
  tMoney: number;
  buyTypeCT: string;
  buyTypeT: string;
}

interface EconomyChartProps {
  matchId: string;
  mapName: string;
  scoreCT: number;
  scoreT: number;
  rounds: RoundEconomy[];
}

type ChartMode = "equipment" | "money" | "total";

const LEGEND_TYPES: BuyTypeKey[] = ["FULL_BUY", "FORCE_BUY", "HALF_BUY", "ECO", "PISTOL"];
const WEAK_BUYS = new Set(["ECO", "FORCE_BUY", "HALF_BUY"]);

function buyLabel(bt: string) {
  return BUY_TYPE_LABELS[bt as BuyTypeKey] ?? bt;
}

function buyColor(bt: string) {
  return BUY_TYPE_COLORS[bt as BuyTypeKey] ?? "var(--surface-3)";
}

function money(v: number) {
  return `$${v.toLocaleString("en-US")}`;
}

function sideValue(r: RoundEconomy, side: "ct" | "t", mode: ChartMode) {
  const equip = side === "ct" ? r.ctEquipVal : r.tEquipVal;
  const cash = side === "ct" ? r.ctMoney : r.tMoney;
  return mode === "equipment" ? equip : mode === "money" ? cash : equip + cash;
}

export function EconomyChart({ matchId, mapName, scoreCT, scoreT, rounds }: EconomyChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>("equipment");
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  const chartData = rounds.map((r) => ({
    round: r.round,
    ct: sideValue(r, "ct", chartMode),
    t: sideValue(r, "t", chartMode),
    winner: r.winner,
    winReason: r.winReason,
    buyTypeCT: r.buyTypeCT,
    buyTypeT: r.buyTypeT,
    ctScore: r.ctScore,
    tScore: r.tScore,
  }));

  // MR12: sides swap after round 12
  const halftimeRound = rounds.length > 12 ? 12.5 : null;

  const avg = (vals: number[]) => (vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0);
  const ctAvgEquip = avg(rounds.map((r) => r.ctEquipVal));
  const tAvgEquip = avg(rounds.map((r) => r.tEquipVal));
  // Rounds won on a weaker buy against a full buy
  const upsets = rounds.filter((r) => {
    const winnerBuy = r.winner === "CT" ? r.buyTypeCT : r.buyTypeT;
    const loserBuy = r.winner === "CT" ? r.buyTypeT : r.buyTypeCT;
    return WEAK_BUYS.has(winnerBuy) && loserBuy === "FULL_BUY";
  }).length;
  const fullBuyRounds = rounds.filter((r) => r.buyTypeCT === "FULL_BUY" && r.buyTypeT === "FULL_BUY").length;

  const selected = rounds.find((r) => r.round === selectedRound) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <ToolHeader
        backHref={`/matches/${matchId}`}
        backLabel="Mecz"
        overline="Ekonomia"
        title={mapName}
        scoreCT={scoreCT}
        scoreT={scoreT}
        actions={
          <Segmented<ChartMode>
            label="Co pokazać na wykresie"
            value={chartMode}
            onChange={setChartMode}
            className="w-full sm:w-auto"
            options={[
              { value: "equipment", label: "Ekwipunek" },
              { value: "money", label: "Gotówka" },
              { value: "total", label: "Razem" },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Śr. ekwipunek CT" value={money(ctAvgEquip)} accentColor="var(--ct-blue)" />
        <StatCard label="Śr. ekwipunek T" value={money(tAvgEquip)} accentColor="var(--t-gold)" />
        <StatCard label="Pełny zakup obu" value={fullBuyRounds} hint="rundy, w których obie strony miały full buy" />
        <StatCard label="Wygrane eco/force" value={upsets} hint="eco, half lub force przeciw full buy" />
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-center gap-4 text-[13px]">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-[var(--ct-blue)]" />
            <span className="text-[var(--text-secondary)]">CT</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-[var(--t-gold)]" />
            <span className="text-[var(--text-secondary)]">T</span>
          </span>
          <span className="text-[var(--text-tertiary)]">wartość per runda (strona w danej rundzie)</span>
        </div>
        <div className="h-[240px] md:h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 4, left: -8, bottom: 0 }}
              onClick={(state) => {
                const label = (state as { activeLabel?: string | number } | null)?.activeLabel;
                if (label != null) setSelectedRound(Number(label));
              }}
            >
              <defs>
                <linearGradient id="ctGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CANVAS_COLORS.ct} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={CANVAS_COLORS.ct} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CANVAS_COLORS.t} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={CANVAS_COLORS.t} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CANVAS_COLORS.grid} />
              <XAxis
                dataKey="round"
                tick={{ fill: CANVAS_COLORS.textTertiary, fontSize: 12, fontFamily: "var(--font-mono)" }}
                axisLine={{ stroke: CANVAS_COLORS.axis }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis
                width={44}
                tick={{ fill: CANVAS_COLORS.textTertiary, fontSize: 12, fontFamily: "var(--font-mono)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                content={<EconomyTooltip />}
                cursor={{ stroke: CANVAS_COLORS.accent, strokeWidth: 1, strokeDasharray: "3 3" }}
              />
              {halftimeRound && (
                <ReferenceLine
                  x={halftimeRound}
                  stroke={CANVAS_COLORS.axis}
                  strokeDasharray="4 4"
                  label={{ value: "Połowa", position: "top", fill: CANVAS_COLORS.textTertiary, fontSize: 12 }}
                />
              )}
              {selectedRound != null && (
                <ReferenceLine x={selectedRound} stroke={CANVAS_COLORS.accent} strokeWidth={2} />
              )}
              <Area
                type="monotone"
                dataKey="ct"
                stroke={CANVAS_COLORS.ct}
                strokeWidth={2}
                fill="url(#ctGrad)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: CANVAS_COLORS.ct }}
              />
              <Area
                type="monotone"
                dataKey="t"
                stroke={CANVAS_COLORS.t}
                strokeWidth={2}
                fill="url(#tGrad)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: CANVAS_COLORS.t }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <h2 className="label-overline mb-3 text-[var(--text-tertiary)]">Typy zakupów</h2>
        <div className="overflow-x-auto pb-1">
          <div className="min-w-fit space-y-1.5" style={{ minWidth: `${rounds.length * 20 + 36}px` }}>
            {(["CT", "T"] as const).map((side) => (
              <div key={side} className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-7 shrink-0 font-display text-sm font-semibold",
                    side === "CT" ? "text-[var(--ct-blue)]" : "text-[var(--t-gold)]"
                  )}
                >
                  {side}
                </span>
                <div className="flex flex-1 gap-0.5">
                  {rounds.map((r) => {
                    const bt = side === "CT" ? r.buyTypeCT : r.buyTypeT;
                    const won = r.winner === side;
                    const active = r.round === selectedRound;
                    return (
                      <button
                        key={`${side}-${r.round}`}
                        type="button"
                        onClick={() => setSelectedRound(active ? null : r.round)}
                        aria-label={`Runda ${r.round}, ${side}: ${buyLabel(bt)}${won ? ", wygrana" : ""}`}
                        title={`R${r.round}: ${buyLabel(bt)}${won ? " (wygrana)" : ""}`}
                        className={cn(
                          "relative h-7 min-w-[18px] flex-1 rounded-sm transition-[filter] duration-150 hover:brightness-125",
                          active && "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface-1)]"
                        )}
                        style={{ backgroundColor: buyColor(bt), opacity: won ? 0.95 : 0.45 }}
                      >
                        {won && (
                          <span className="absolute inset-x-0 bottom-0.5 mx-auto h-1 w-1 rounded-full bg-[var(--on-accent)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="w-7 shrink-0" />
              <div className="flex flex-1 gap-0.5">
                {rounds.map((r) => (
                  <span
                    key={`n-${r.round}`}
                    className="min-w-[18px] flex-1 text-center font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]"
                  >
                    {r.round % 3 === 0 || r.round === 1 ? r.round : ""}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
          {LEGEND_TYPES.map((bt) => (
            <span key={bt} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: BUY_TYPE_COLORS[bt] }} />
              <span className="text-[var(--text-tertiary)]">{BUY_TYPE_LABELS[bt]}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="relative h-3 w-3 rounded-sm bg-[var(--text-tertiary)]">
              <span className="absolute inset-x-0 bottom-0.5 mx-auto h-1 w-1 rounded-full bg-[var(--on-accent)]" />
            </span>
            <span className="text-[var(--text-tertiary)]">wygrana runda (pełny kolor)</span>
          </span>
        </div>

        {selected ? (
          <RoundDetail round={selected} matchId={matchId} onClose={() => setSelectedRound(null)} />
        ) : (
          <p className="mt-3 text-[13px] text-[var(--text-tertiary)]">
            Dotknij rundy na pasku lub na wykresie, aby zobaczyć szczegóły.
          </p>
        )}
      </Card>
    </div>
  );
}

function RoundDetail({ round, matchId, onClose }: { round: RoundEconomy; matchId: string; onClose: () => void }) {
  return (
    <div className="mt-4 rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <p className="font-display text-sm font-semibold text-[var(--text-primary)]">Runda {round.round}</p>
        <span className="font-mono text-[13px] tabular-nums text-[var(--text-tertiary)]">
          {round.ctScore}:{round.tScore}
        </span>
        <span className="text-[13px] text-[var(--text-tertiary)]">
          · wygrali{" "}
          <span className={round.winner === "CT" ? "text-[var(--ct-blue)]" : "text-[var(--t-gold)]"}>{round.winner}</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-x-3 gap-y-1 text-[13px]">
        <span />
        <span className="label-overline text-[var(--text-tertiary)]">Ekwipunek</span>
        <span className="label-overline text-[var(--text-tertiary)]">Gotówka</span>
        <span />
        {(["CT", "T"] as const).map((side) => {
          const ct = side === "CT";
          const bt = ct ? round.buyTypeCT : round.buyTypeT;
          return (
            <div key={side} className="contents">
              <span className={cn("font-display font-semibold", ct ? "text-[var(--ct-blue)]" : "text-[var(--t-gold)]")}>
                {side}
              </span>
              <span className="font-mono tabular-nums text-[var(--text-primary)]">
                {money(ct ? round.ctEquipVal : round.tEquipVal)}
              </span>
              <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                {money(ct ? round.ctMoney : round.tMoney)}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold text-[var(--on-accent)]"
                style={{ backgroundColor: buyColor(bt) }}
              >
                {buyLabel(bt)}
              </span>
            </div>
          );
        })}
      </div>
      <Link
        href={`/replay/${matchId}?round=${round.round}`}
        className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-3")}
      >
        <Play className="h-3.5 w-3.5" />
        Otwórz rundę w replayu
      </Link>
    </div>
  );
}

interface TooltipPayloadItem {
  payload: {
    round: number;
    ct: number;
    t: number;
    winner: string;
    winReason: string;
    buyTypeCT: string;
    buyTypeT: string;
    ctScore: number;
    tScore: number;
  };
}

function EconomyTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--border-hover)] bg-[var(--surface-2)] px-3 py-2 shadow-[var(--shadow-md)]">
      <p className="mb-1 text-[13px] font-semibold text-[var(--text-primary)]">
        Runda {d.round}
        <span className="ml-2 font-mono font-normal tabular-nums text-[var(--text-tertiary)]">
          {d.ctScore}:{d.tScore}
        </span>
      </p>
      {(["CT", "T"] as const).map((side) => (
        <div key={side} className="flex items-center justify-between gap-4 text-[13px]">
          <span className={side === "CT" ? "text-[var(--ct-blue)]" : "text-[var(--t-gold)]"}>{side}</span>
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">{money(side === "CT" ? d.ct : d.t)}</span>
          <span className="text-xs text-[var(--text-tertiary)]">{buyLabel(side === "CT" ? d.buyTypeCT : d.buyTypeT)}</span>
        </div>
      ))}
      <p className="mt-1 text-xs text-[var(--text-tertiary)]">
        Wygrali {d.winner}
      </p>
    </div>
  );
}
