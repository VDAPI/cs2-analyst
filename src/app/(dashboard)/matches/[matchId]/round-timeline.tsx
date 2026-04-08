"use client";

import { useState } from "react";
import { Crosshair, Shield, Flame, Timer } from "lucide-react";

interface KillData {
  attackerName: string;
  victimName: string;
  weapon: string;
  headshot: boolean;
  wallbang: boolean;
  throughSmoke: boolean;
  noScope: boolean;
  isFirstKill: boolean;
}

interface RoundData {
  number: number;
  winner: "CT" | "T";
  winReason: string;
  kills: KillData[];
}

const WIN_REASON_LABELS: Record<string, { label: string; icon: typeof Crosshair }> = {
  ELIMINATION: { label: "Elimination", icon: Crosshair },
  BOMB_EXPLODED: { label: "Bomb Exploded", icon: Flame },
  BOMB_DEFUSED: { label: "Bomb Defused", icon: Shield },
  TIME_RAN_OUT: { label: "Time Ran Out", icon: Timer },
  TARGET_SAVED: { label: "Target Saved", icon: Shield },
};

export function RoundTimeline({ rounds }: { rounds: RoundData[] }) {
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  const selected = selectedRound !== null
    ? rounds.find((r) => r.number === selectedRound)
    : null;

  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-medium uppercase text-[var(--text-tertiary)]">
        Round Timeline
        {selectedRound !== null && (
          <button
            onClick={() => setSelectedRound(null)}
            className="ml-2 text-[var(--accent)] normal-case hover:underline"
          >
            clear
          </button>
        )}
      </p>

      {/* Round pills */}
      <div className="flex flex-wrap gap-1">
        {rounds.map((r) => {
          const isSelected = selectedRound === r.number;
          return (
            <button
              key={r.number}
              onClick={() => setSelectedRound(isSelected ? null : r.number)}
              className={`flex h-7 w-7 items-center justify-center rounded text-[10px] font-bold transition-all ${
                r.winner === "CT"
                  ? isSelected
                    ? "bg-[var(--ct-blue)] text-white ring-2 ring-[var(--ct-blue)] ring-offset-1 ring-offset-[var(--surface-1)]"
                    : "bg-[var(--ct-blue-muted)] text-[var(--ct-blue)] hover:bg-[var(--ct-blue)] hover:text-white"
                  : isSelected
                    ? "bg-[var(--t-gold)] text-black ring-2 ring-[var(--t-gold)] ring-offset-1 ring-offset-[var(--surface-1)]"
                    : "bg-[var(--t-gold-muted)] text-[var(--t-gold)] hover:bg-[var(--t-gold)] hover:text-black"
              }`}
              title={`Round ${r.number}: ${r.winner} (${WIN_REASON_LABELS[r.winReason]?.label ?? r.winReason})`}
            >
              {r.number}
            </button>
          );
        })}
      </div>

      {/* Kill feed for selected round */}
      {selected && (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${
                selected.winner === "CT" ? "text-[var(--ct-blue)]" : "text-[var(--t-gold)]"
              }`}>
                Round {selected.number}
              </span>
              <RoundReasonBadge winReason={selected.winReason} winner={selected.winner} />
            </div>
            <span className="text-xs text-[var(--text-tertiary)]">
              {selected.kills.length} kill{selected.kills.length !== 1 ? "s" : ""}
            </span>
          </div>

          {selected.kills.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">No kills this round</p>
          ) : (
            <div className="space-y-1.5">
              {selected.kills.map((k, i) => (
                <KillFeedEntry key={i} kill={k} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RoundReasonBadge({ winReason, winner }: { winReason: string; winner: "CT" | "T" }) {
  const info = WIN_REASON_LABELS[winReason];
  if (!info) return null;
  const Icon = info.icon;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
      winner === "CT"
        ? "bg-[var(--ct-blue-muted)] text-[var(--ct-blue)]"
        : "bg-[var(--t-gold-muted)] text-[var(--t-gold)]"
    }`}>
      <Icon className="h-3 w-3" />
      {info.label}
    </span>
  );
}

function KillFeedEntry({ kill }: { kill: KillData }) {
  const modifiers: string[] = [];
  if (kill.headshot) modifiers.push("HS");
  if (kill.wallbang) modifiers.push("WB");
  if (kill.throughSmoke) modifiers.push("Smoke");
  if (kill.noScope) modifiers.push("No-scope");

  return (
    <div className="flex items-center gap-2 text-xs">
      {kill.isFirstKill && (
        <span className="rounded bg-[var(--warning-muted)] px-1 py-0.5 text-[9px] font-bold text-[var(--warning)]">
          FK
        </span>
      )}
      <span className="font-medium text-[var(--text-primary)]">
        {kill.attackerName}
      </span>
      <span className="flex items-center gap-1 text-[var(--text-disabled)]">
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
          {kill.weapon}
        </span>
        {kill.headshot && (
          <span className="text-[var(--error)]" title="Headshot">
            ●
          </span>
        )}
      </span>
      <span className="font-medium text-[var(--text-secondary)]">
        {kill.victimName}
      </span>
      {modifiers.length > 0 && (
        <span className="text-[10px] text-[var(--text-tertiary)]">
          ({modifiers.join(", ")})
        </span>
      )}
    </div>
  );
}
