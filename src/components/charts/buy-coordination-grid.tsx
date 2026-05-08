"use client";

import { BUY_TYPE_COLORS, BUY_TYPE_LABELS, type BuyTypeKey } from "@/lib/utils/buyType";
import { BUY_SYNC_DESYNC_THRESHOLD } from "@/lib/utils/buySync";

export interface PlayerRow {
  steamId: string;
  name: string;
  cells: Array<{ round: number; buyType: BuyTypeKey }>;
}

export interface BuyCoordinationGridProps {
  rounds: number[];
  ctRows: PlayerRow[];
  tRows: PlayerRow[];
  ctSyncByRound: Record<number, number>;
  tSyncByRound: Record<number, number>;
  ctAvgSync: number;
  tAvgSync: number;
}

export function BuyCoordinationGrid({
  rounds,
  ctRows,
  tRows,
  ctSyncByRound,
  tSyncByRound,
  ctAvgSync,
  tAvgSync,
}: BuyCoordinationGridProps) {
  if (rounds.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6">
        <p className="text-sm text-[var(--text-tertiary)]">
          No per-player economy data yet. Re-parse this match to populate it.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Buy Coordination
        </h2>
        <p className="font-mono text-xs text-[var(--text-tertiary)]">
          <span className="text-[var(--ct-blue)]">CT avg {ctAvgSync}%</span>
          <span className="mx-2 text-[var(--text-disabled)]">·</span>
          <span className="text-[var(--t-gold)]">T avg {tAvgSync}%</span>
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-fit space-y-3">
          <SideBlock
            label="CT"
            color="var(--ct-blue)"
            rows={ctRows}
            rounds={rounds}
            syncByRound={ctSyncByRound}
          />
          <SideBlock
            label="T"
            color="var(--t-gold)"
            rows={tRows}
            rounds={rounds}
            syncByRound={tSyncByRound}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px]">
        {(["FULL_BUY", "FORCE_BUY", "HALF_BUY", "ECO", "PISTOL"] as BuyTypeKey[]).map(
          (bt) => (
            <div key={bt} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: BUY_TYPE_COLORS[bt] }}
              />
              <span className="text-[var(--text-tertiary)]">
                {BUY_TYPE_LABELS[bt]}
              </span>
            </div>
          )
        )}
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm border-2 border-[var(--error)]" />
          <span className="text-[var(--text-tertiary)]">
            Desync (&lt; {BUY_SYNC_DESYNC_THRESHOLD}%)
          </span>
        </div>
      </div>
    </div>
  );
}

function SideBlock({
  label,
  color,
  rows,
  rounds,
  syncByRound,
}: {
  label: "CT" | "T";
  color: string;
  rows: PlayerRow[];
  rounds: number[];
  syncByRound: Record<number, number>;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
        {label}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `120px repeat(${rounds.length}, 18px)` }}>
        {/* Header row: round numbers */}
        <div />
        {rounds.map((rn) => {
          const sync = syncByRound[rn] ?? 0;
          const desync = sync < BUY_SYNC_DESYNC_THRESHOLD;
          return (
            <div
              key={`hdr-${rn}`}
              className={`text-center text-[8px] font-mono ${desync ? "text-[var(--error)]" : "text-[var(--text-disabled)]"}`}
              title={`Round ${rn}: ${sync}% sync`}
            >
              {rn}
            </div>
          );
        })}
        {/* Player rows */}
        {rows.map((row) => (
          <PlayerCellRow key={row.steamId} row={row} rounds={rounds} syncByRound={syncByRound} />
        ))}
      </div>
    </div>
  );
}

function PlayerCellRow({
  row,
  rounds,
  syncByRound,
}: {
  row: PlayerRow;
  rounds: number[];
  syncByRound: Record<number, number>;
}) {
  const cellByRound = new Map(row.cells.map((c) => [c.round, c.buyType]));
  return (
    <>
      <div className="truncate pr-2 text-xs text-[var(--text-secondary)]" title={row.name}>
        {row.name}
      </div>
      {rounds.map((rn) => {
        const bt = cellByRound.get(rn) ?? "UNKNOWN";
        const sync = syncByRound[rn] ?? 0;
        const desync = sync < BUY_SYNC_DESYNC_THRESHOLD;
        return (
          <div
            key={`${row.steamId}-${rn}`}
            className={`mx-px my-px h-4 rounded-sm transition-all duration-150 ${desync ? "outline outline-1 outline-[var(--error)]" : ""}`}
            style={{
              backgroundColor: BUY_TYPE_COLORS[bt],
              opacity: 0.75,
            }}
            title={`R${rn} ${row.name}: ${BUY_TYPE_LABELS[bt]}${desync ? ` (team ${sync}% sync)` : ""}`}
          />
        );
      })}
    </>
  );
}
