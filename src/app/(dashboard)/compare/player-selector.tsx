"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  Button,
  InitialsAvatar,
  Input,
  PageHeader,
  EmptyState,
} from "@/components/ui";
import { Search, GitCompare, X, Users } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PLAYER_COLORS, PLAYER_MUTED, matchesLabel } from "./compare-ui";
import type { PlayerSummary } from "./types";
import { StartActions } from "@/components/onboarding/getting-started";

interface PlayerSelectorProps {
  players: PlayerSummary[];
  /** Pre-fills slot 1 (from `/compare?p1=<steamId>`, e.g. the player profile). */
  initialSteamId?: string;
}

export function PlayerSelector({ players, initialSteamId }: PlayerSelectorProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<[PlayerSummary | null, PlayerSummary | null]>(() => [
    players.find((p) => p.steamId === initialSteamId) ?? null,
    null,
  ]);

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

  function getSlotIndex(steamId: string): 1 | 2 | null {
    if (selected[0]?.steamId === steamId) return 1;
    if (selected[1]?.steamId === steamId) return 2;
    return null;
  }

  const canCompare = selected[0] && selected[1];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analiza"
        title="Porównaj graczy"
        description="Wybierz dwóch graczy, aby zestawić ich statystyki obok siebie."
      />

      {/* Selected players */}
      <Card className="space-y-4">
        <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <SelectedSlot
            player={selected[0]}
            label="Gracz 1"
            slot="p1"
            onClear={() => setSelected([selected[1], null])}
          />
          <div className="flex justify-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)]">
              <GitCompare className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
            </div>
          </div>
          <SelectedSlot
            player={selected[1]}
            label="Gracz 2"
            slot="p2"
            onClear={() => setSelected([selected[0], null])}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--text-tertiary)]">
            {canCompare
              ? "Gotowe — możesz porównać."
              : "Dotknij gracza na liście, aby dodać go do porównania."}
          </p>
          <Button
            variant="cta"
            disabled={!canCompare}
            onClick={() => {
              if (selected[0] && selected[1]) {
                router.push(`/compare/${selected[0].steamId}/vs/${selected[1].steamId}`);
              }
            }}
            className="w-full sm:w-auto"
          >
            <GitCompare className="h-4 w-4" aria-hidden />
            Porównaj
          </Button>
        </div>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Szukaj gracza…"
          aria-label="Szukaj gracza"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-h-11 pl-10"
        />
      </div>

      {/* Player list */}
      {filtered.length === 0 ? (
        players.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Brak danych o graczach"
            description="Wgraj dema, aby zacząć porównywać graczy."
            action={<StartActions faceit={false} />}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="Brak wyników"
            description="Żaden gracz nie pasuje do wyszukiwania."
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((player) => {
            const slot = getSlotIndex(player.steamId);
            const key = slot === 1 ? "p1" : slot === 2 ? "p2" : null;

            return (
              <button
                key={player.steamId}
                type="button"
                aria-pressed={slot !== null}
                onClick={() => togglePlayer(player)}
                className={cn(
                  "flex min-h-16 w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-glow)]",
                  key
                    ? ""
                    : "border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)]"
                )}
                style={key ? { borderColor: PLAYER_COLORS[key], backgroundColor: PLAYER_MUTED[key] } : undefined}
              >
                <InitialsAvatar name={player.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {player.name}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    <span className="stat-inline text-[var(--text-tertiary)]">
                      {matchesLabel(player.matchCount)}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                      {player.avgKd.toFixed(2)} <span className="text-[var(--text-tertiary)]">K/D</span>
                    </span>
                    <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                      {player.avgHltv.toFixed(2)} <span className="text-[var(--text-tertiary)]">HLTV</span>
                    </span>
                  </div>
                </div>
                {key ? (
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold text-[var(--on-accent)]"
                    style={{ backgroundColor: PLAYER_COLORS[key] }}
                    aria-label={`Gracz ${slot}`}
                  >
                    {slot}
                  </span>
                ) : (
                  <span
                    className="h-6 w-6 shrink-0 rounded-full border border-[var(--border)]"
                    aria-hidden
                  />
                )}
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
  slot,
  onClear,
}: {
  player: PlayerSummary | null;
  label: string;
  slot: "p1" | "p2";
  onClear: () => void;
}) {
  const color = PLAYER_COLORS[slot];

  if (!player) {
    return (
      <div className="flex min-h-14 min-w-0 items-center gap-3 rounded-lg border border-dashed border-[var(--border)] px-3 py-2">
        <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--surface-3)]" />
        <div className="min-w-0">
          <p className="label-overline" style={{ color }}>
            {label}
          </p>
          <p className="text-sm text-[var(--text-disabled)]">Nie wybrano</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-14 min-w-0 items-center gap-3 rounded-lg border px-3 py-2"
      style={{ borderColor: color, backgroundColor: PLAYER_MUTED[slot] }}
    >
      <InitialsAvatar name={player.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="label-overline" style={{ color }}>
          {label}
        </p>
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{player.name}</p>
        <p className="stat-inline text-xs text-[var(--text-tertiary)]">
          {matchesLabel(player.matchCount)}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        aria-label={`Usuń: ${player.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-secondary)] md:h-8 md:w-8"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
