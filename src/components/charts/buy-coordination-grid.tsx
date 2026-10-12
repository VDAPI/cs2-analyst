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
          Brak danych o zakupach graczy. Przeanalizuj mecz ponownie, aby je uzupełnić.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="label-overline text-[var(--text-tertiary)]">Koordynacja zakupów</h2>
          <p className="mt-0.5 text-[13px] text-[var(--text-tertiary)]">
            Czy drużyna kupuje razem. Wiersze to drużyny według strony z drugiej połowy.
          </p>
        </div>
        <p className="font-mono text-[13px] tabular-nums text-[var(--text-tertiary)]">
          <span className="text-[var(--ct-blue)]">CT śr. {ctAvgSync}%</span>
          <span className="mx-2 text-[var(--text-disabled)]">·</span>
          <span className="text-[var(--t-gold)]">T śr. {tAvgSync}%</span>
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
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        {(["FULL_BUY", "FORCE_BUY", "HALF_BUY", "ECO", "PISTOL"] as BuyTypeKey[]).map(
          (bt) => (
            <div key={bt} className="flex items-center gap-1.5">
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: BUY_TYPE_COLORS[bt] }}
              />
              <span className="text-[var(--text-tertiary)]">
                {BUY_TYPE_LABELS[bt]}
              </span>
            </div>
          )
        )}
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm border-2 border-[var(--mistake)]" />
          <span className="text-[var(--text-tertiary)]">
            Rozjazd (&lt; {BUY_SYNC_DESYNC_THRESHOLD}% zgodności)
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
      <div className="label-overline mb-1.5 flex items-center gap-2" style={{ color }}>
        {label}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `minmax(96px,128px) repeat(${rounds.length}, 20px)` }}>
        {/* Header row: round numbers */}
        <div className="sticky left-0 z-10 bg-[var(--surface-1)]" />
        {rounds.map((rn) => {
          const sync = syncByRound[rn] ?? 0;
          const desync = sync < BUY_SYNC_DESYNC_THRESHOLD;
          return (
            <div
              key={`hdr-${rn}`}
              className={`text-center font-mono text-[11px] tabular-nums ${desync ? "text-[var(--mistake)]" : "text-[var(--text-tertiary)]"}`}
              title={`Runda ${rn}: ${sync}% zgodności`}
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
      <div
        className="sticky left-0 z-10 truncate bg-[var(--surface-1)] py-0.5 pr-2 font-mono text-[13px] text-[var(--text-secondary)]"
        title={row.name}
      >
        {row.name}
      </div>
      {rounds.map((rn) => {
        const bt = cellByRound.get(rn) ?? "UNKNOWN";
        const sync = syncByRound[rn] ?? 0;
        const desync = sync < BUY_SYNC_DESYNC_THRESHOLD;
        return (
          <div
            key={`${row.steamId}-${rn}`}
            className={`m-px h-5 rounded-sm transition-all duration-150 ${desync ? "outline outline-1 outline-[var(--mistake)]" : ""}`}
            style={{
              backgroundColor: BUY_TYPE_COLORS[bt],
              opacity: 0.75,
            }}
            title={`R${rn} ${row.name}: ${BUY_TYPE_LABELS[bt]}${desync ? ` (drużyna ${sync}% zgodności)` : ""}`}
          />
        );
      })}
    </>
  );
}
