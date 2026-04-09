"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { Search, GitCompare, X } from "lucide-react";
import type { PlayerSummary } from "./types";

interface PlayerSelectorProps {
  players: PlayerSummary[];
}

export function PlayerSelector({ players }: PlayerSelectorProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<[PlayerSummary | null, PlayerSummary | null]>([null, null]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return players;
    const q = searchQuery.toLowerCase();
    return players.filter((p) => p.name.toLowerCase().includes(q));
  }, [players, searchQuery]);

  function togglePlayer(player: PlayerSummary) {
    // If already selected, deselect
    if (selected[0]?.steamId === player.steamId) {
      setSelected([selected[1], null]);
      return;
    }
    if (selected[1]?.steamId === player.steamId) {
      setSelected([selected[0], null]);
      return;
    }
    // Add to first empty slot
    if (!selected[0]) {
      setSelected([player, selected[1]]);
    } else if (!selected[1]) {
      setSelected([selected[0], player]);
    } else {
      // Both filled, replace second
      setSelected([selected[0], player]);
    }
  }

  function isSelected(steamId: string) {
    return selected[0]?.steamId === steamId || selected[1]?.steamId === steamId;
  }

  function getSlotIndex(steamId: string): 1 | 2 | null {
    if (selected[0]?.steamId === steamId) return 1;
    if (selected[1]?.steamId === steamId) return 2;
    return null;
  }

  function getInitials(name: string) {
    return name
      .split(/[\s_-]+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }

  const canCompare = selected[0] && selected[1];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Compare Players
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Select two players to compare their stats side by side.
        </p>
      </div>

      {/* Selected players bar */}
      <Card className="flex items-center gap-4">
        <SelectedSlot
          player={selected[0]}
          label="Player 1"
          color="var(--ct-blue)"
          onClear={() => setSelected([selected[1], null])}
        />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)]">
          <GitCompare className="h-4 w-4 text-[var(--text-tertiary)]" />
        </div>
        <SelectedSlot
          player={selected[1]}
          label="Player 2"
          color="var(--t-gold)"
          onClear={() => setSelected([selected[0], null])}
        />
        <Button
          disabled={!canCompare}
          onClick={() => {
            if (selected[0] && selected[1]) {
              router.push(`/compare/${selected[0].steamId}/vs/${selected[1].steamId}`);
            }
          }}
          className="ml-auto shrink-0"
        >
          Compare
        </Button>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="text"
          placeholder="Search players..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder-[var(--text-disabled)] outline-none transition-colors focus:border-[var(--accent)]"
        />
      </div>

      {/* Player grid */}
      {filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              {players.length === 0
                ? "No player data yet. Upload demos to get started."
                : "No players match your search."}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((player) => {
            const sel = isSelected(player.steamId);
            const slot = getSlotIndex(player.steamId);
            const slotColor = slot === 1 ? "var(--ct-blue)" : slot === 2 ? "var(--t-gold)" : undefined;

            return (
              <button
                key={player.steamId}
                onClick={() => togglePlayer(player)}
                className={`flex flex-col items-center gap-3 rounded-xl border p-4 text-left transition-all duration-150 ${
                  sel
                    ? "border-[var(--accent)] bg-[rgba(59,130,246,0.08)]"
                    : "border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)]"
                }`}
                style={sel && slotColor ? { borderColor: slotColor } : undefined}
              >
                {/* Avatar */}
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold"
                  style={{
                    backgroundColor: sel && slotColor ? `${slotColor}22` : "var(--surface-3)",
                    color: sel && slotColor ? slotColor : "var(--text-secondary)",
                  }}
                >
                  {getInitials(player.name)}
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {player.name}
                  </p>
                  <p className="stat-inline mt-0.5 text-xs text-[var(--text-tertiary)]">
                    {player.matchCount} match{player.matchCount !== 1 ? "es" : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SelectedSlot({
  player,
  label,
  color,
  onClear,
}: {
  player: PlayerSummary | null;
  label: string;
  color: string;
  onClear: () => void;
}) {
  if (!player) {
    return (
      <div className="flex flex-1 items-center gap-3 rounded-lg border border-dashed border-[var(--border)] px-4 py-2">
        <div className="h-8 w-8 rounded-full bg-[var(--surface-3)]" />
        <span className="text-sm text-[var(--text-disabled)]">{label}</span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-1 items-center gap-3 rounded-lg border px-4 py-2"
      style={{ borderColor: color }}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
        style={{ backgroundColor: `${color}22`, color }}
      >
        {player.name
          .split(/[\s_-]+/)
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase() ?? "")
          .join("")}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{player.name}</p>
        <p className="stat-inline text-xs text-[var(--text-tertiary)]">
          {player.matchCount} match{player.matchCount !== 1 ? "es" : ""}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        className="rounded p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-secondary)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
