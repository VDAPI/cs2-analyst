"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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

const BUY_TYPE_LABELS: Record<string, string> = {
  FULL_BUY: "Full",
  FORCE_BUY: "Force",
  HALF_BUY: "Half",
  ECO: "Eco",
  PISTOL: "Pistol",
  UNKNOWN: "—",
};

const BUY_TYPE_COLORS: Record<string, string> = {
  FULL_BUY: "var(--success)",
  FORCE_BUY: "var(--warning)",
  HALF_BUY: "#f59e0b",
  ECO: "var(--error)",
  PISTOL: "var(--accent)",
  UNKNOWN: "var(--text-disabled)",
};

export function EconomyChart({
  matchId,
  mapName,
  scoreCT,
  scoreT,
  rounds,
}: EconomyChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>("equipment");

  const chartData = rounds.map((r) => {
    const ctVal = chartMode === "equipment" ? r.ctEquipVal
      : chartMode === "money" ? r.ctMoney
      : r.ctEquipVal + r.ctMoney;
    const tVal = chartMode === "equipment" ? r.tEquipVal
      : chartMode === "money" ? r.tMoney
      : r.tEquipVal + r.tMoney;

    return {
      round: r.round,
      ct: ctVal,
      t: tVal,
      winner: r.winner,
      winReason: r.winReason,
      buyTypeCT: r.buyTypeCT,
      buyTypeT: r.buyTypeT,
      ctScore: r.ctScore,
      tScore: r.tScore,
    };
  });

  // Find halftime round (round 12 in standard MR12)
  const halftimeRound = rounds.length > 12 ? 12.5 : null;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/matches/${matchId}`}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Match
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Economy — {mapName}
          </h1>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-[var(--ct-blue)]">{scoreCT}</span>
            <span className="text-[var(--text-disabled)]">:</span>
            <span className="font-mono text-lg font-bold text-[var(--t-gold)]">{scoreT}</span>
          </div>
        </div>

        {/* Mode selector */}
        <div className="flex gap-1 rounded-lg bg-[var(--surface-1)] p-1">
          {(["equipment", "money", "total"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setChartMode(mode)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                chartMode === mode
                  ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {mode === "equipment" ? "Equipment" : mode === "money" ? "Cash" : "Total"}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <ResponsiveContainer width="100%" height={380}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="ctGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="round"
              tick={{ fill: "var(--text-tertiary)", fontSize: 11, fontFamily: "Geist Mono, monospace" }}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "var(--text-tertiary)", fontSize: 11, fontFamily: "Geist Mono, monospace" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<EconomyTooltip />} />
            {halftimeRound && (
              <ReferenceLine
                x={halftimeRound}
                stroke="rgba(255,255,255,0.15)"
                strokeDasharray="4 4"
                label={{
                  value: "Half",
                  position: "top",
                  fill: "var(--text-disabled)",
                  fontSize: 10,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="ct"
              stroke="#60a5fa"
              strokeWidth={2}
              fill="url(#ctGrad)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: "#60a5fa" }}
            />
            <Area
              type="monotone"
              dataKey="t"
              stroke="#fbbf24"
              strokeWidth={2}
              fill="url(#tGrad)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: "#fbbf24" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Buy type timeline */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Buy Types
        </p>
        <div className="space-y-2">
          {/* CT row */}
          <div className="flex items-center gap-2">
            <span className="w-8 text-xs font-medium text-[var(--ct-blue)]">CT</span>
            <div className="flex flex-1 gap-0.5">
              {rounds.map((r) => (
                <BuyTypePill key={`ct-${r.round}`} buyType={r.buyTypeCT} winner={r.winner === "CT"} round={r.round} />
              ))}
            </div>
          </div>
          {/* T row */}
          <div className="flex items-center gap-2">
            <span className="w-8 text-xs font-medium text-[var(--t-gold)]">T</span>
            <div className="flex flex-1 gap-0.5">
              {rounds.map((r) => (
                <BuyTypePill key={`t-${r.round}`} buyType={r.buyTypeT} winner={r.winner === "T"} round={r.round} />
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-3">
          {["FULL_BUY", "FORCE_BUY", "HALF_BUY", "ECO", "PISTOL"].map((bt) => (
            <div key={bt} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: BUY_TYPE_COLORS[bt] }}
              />
              <span className="text-[10px] text-[var(--text-tertiary)]">{BUY_TYPE_LABELS[bt]}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm border border-[var(--success)]" />
            <span className="text-[10px] text-[var(--text-tertiary)]">Round win</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BuyTypePill({ buyType, winner, round }: { buyType: string; winner: boolean; round: number }) {
  return (
    <div
      className="group relative flex-1"
      title={`R${round}: ${BUY_TYPE_LABELS[buyType] ?? buyType}${winner ? " (Won)" : ""}`}
    >
      <div
        className="h-5 rounded-sm transition-all duration-150 hover:brightness-125"
        style={{
          backgroundColor: BUY_TYPE_COLORS[buyType] ?? "var(--surface-3)",
          opacity: 0.7,
          border: winner ? "1px solid var(--success)" : "1px solid transparent",
        }}
      />
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] text-white opacity-0 group-hover:opacity-100">
        {round}
      </span>
    </div>
  );
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
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
  const data = payload[0].payload;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[rgba(15,15,18,0.95)] px-3 py-2 shadow-lg backdrop-blur-sm">
      <p className="mb-1 text-xs font-medium text-[var(--text-primary)]">
        Round {data.round}
        <span className="ml-2 font-mono text-[10px] text-[var(--text-tertiary)]">
          {data.ctScore}:{data.tScore}
        </span>
      </p>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-6 text-xs">
          <span className="text-[var(--ct-blue)]">CT</span>
          <span className="font-mono text-[var(--text-secondary)]">
            ${data.ct.toLocaleString()}
          </span>
          <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
            {BUY_TYPE_LABELS[data.buyTypeCT]}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6 text-xs">
          <span className="text-[var(--t-gold)]">T</span>
          <span className="font-mono text-[var(--text-secondary)]">
            ${data.t.toLocaleString()}
          </span>
          <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
            {BUY_TYPE_LABELS[data.buyTypeT]}
          </span>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-[var(--text-disabled)]">
        Won by {data.winner} — {data.winReason.replace(/_/g, " ").toLowerCase()}
      </p>
    </div>
  );
}
