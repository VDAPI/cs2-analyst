"use client";

import { useState } from "react";
import { Crosshair, Shield, Flame, Timer, Zap } from "lucide-react";
import type { MultiKill } from "@/lib/utils/multiKills";
import { BUY_TYPE_COLORS, BUY_TYPE_LABELS, type BuyTypeKey } from "@/lib/utils/buyType";

interface KillData {
  attackerSteamId: string;
  attackerName: string;
  victimName: string;
  victimSteamId: string;
  weapon: string;
  headshot: boolean;
  wallbang: boolean;
  throughSmoke: boolean;
  noScope: boolean;
  isFirstKill: boolean;
  traded: boolean;
  tradeKill: boolean;
  attackerTeam: "CT" | "T" | null;
}

interface RoundData {
  number: number;
  winner: "CT" | "T";
  winReason: string;
  buyTypeCT: string;
  buyTypeT: string;
  kills: KillData[];
}

interface ClutchInfo {
  steamId: string;
  playerName: string;
  team: "CT" | "T";
  size: 1 | 2 | 3 | 4 | 5;
  won: boolean;
}

interface RoundTimelineProps {
  rounds: RoundData[];
  multiKillMap: Record<number, MultiKill[]>;
  clutchMap: Record<number, ClutchInfo>;
}

const WIN_REASON_LABELS: Record<string, { label: string; icon: typeof Crosshair }> = {
  ELIMINATION: { label: "Elimination", icon: Crosshair },
  BOMB_EXPLODED: { label: "Bomb Exploded", icon: Flame },
  BOMB_DEFUSED: { label: "Bomb Defused", icon: Shield },
  TIME_RAN_OUT: { label: "Time Ran Out", icon: Timer },
  TARGET_SAVED: { label: "Target Saved", icon: Shield },
};

export function RoundTimeline({ rounds, multiKillMap, clutchMap }: RoundTimelineProps) {
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  const selected = selectedRound !== null
    ? rounds.find((r) => r.number === selectedRound)
    : null;

  const selectedMultiKills = selectedRound !== null
    ? multiKillMap[selectedRound] ?? []
    : [];

  const selectedClutch = selectedRound !== null
    ? clutchMap[selectedRound] ?? null
    : null;

  const selectedFirstKill = selected
    ? selected.kills.find((k) => k.isFirstKill) ?? null
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
          const roundMk = multiKillMap[r.number];
          const hasAce = roundMk?.some((mk) => mk.type === "ace");
          const bestMk = roundMk?.reduce<MultiKill | null>(
            (best, mk) => (!best || mk.count > best.count ? mk : best),
            null
          );
          const clutch = clutchMap[r.number];
          const showClutch = clutch && !hasAce && !bestMk;

          const titleParts: string[] = [
            `Round ${r.number}: ${r.winner} (${WIN_REASON_LABELS[r.winReason]?.label ?? r.winReason})`,
          ];
          if (bestMk) titleParts.push(`${bestMk.playerName} ${bestMk.type.toUpperCase()}`);
          if (clutch) titleParts.push(`${clutch.playerName} 1v${clutch.size} ${clutch.won ? "WON" : "LOST"}`);

          return (
            <button
              key={r.number}
              onClick={() => setSelectedRound(isSelected ? null : r.number)}
              className={`relative flex h-7 items-center justify-center rounded text-[10px] font-bold transition-all ${
                bestMk || showClutch ? "w-auto min-w-7 gap-0.5 px-1" : "w-7"
              } ${
                hasAce
                  ? isSelected
                    ? "animate-pulse-gold bg-[var(--t-gold)] text-black ring-2 ring-[var(--t-gold)] ring-offset-1 ring-offset-[var(--surface-1)]"
                    : "animate-pulse-gold bg-[var(--t-gold-muted)] text-[var(--t-gold)] hover:bg-[var(--t-gold)] hover:text-black"
                  : r.winner === "CT"
                    ? isSelected
                      ? "bg-[var(--ct-blue)] text-white ring-2 ring-[var(--ct-blue)] ring-offset-1 ring-offset-[var(--surface-1)]"
                      : "bg-[var(--ct-blue-muted)] text-[var(--ct-blue)] hover:bg-[var(--ct-blue)] hover:text-white"
                    : isSelected
                      ? "bg-[var(--t-gold)] text-black ring-2 ring-[var(--t-gold)] ring-offset-1 ring-offset-[var(--surface-1)]"
                      : "bg-[var(--t-gold-muted)] text-[var(--t-gold)] hover:bg-[var(--t-gold)] hover:text-black"
              }`}
              title={titleParts.join(" — ")}
            >
              {r.number}
              {bestMk && (
                <span className="text-[8px] font-black uppercase opacity-80">
                  {bestMk.type === "ace" ? "A" : bestMk.type}
                </span>
              )}
              {showClutch && (
                <span
                  className={`text-[8px] font-black uppercase ${clutch.won ? "text-[var(--success)]" : "opacity-60"}`}
                  title={`Clutch 1v${clutch.size}`}
                >
                  1v{clutch.size}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Buy type strips: CT row, then T row */}
      <div className="mt-1.5 flex flex-col gap-0.5">
        <div className="flex gap-1">
          {rounds.map((r) => (
            <BuyTypeCell
              key={`ct-${r.number}`}
              buyType={r.buyTypeCT}
              round={r.number}
              side="CT"
            />
          ))}
        </div>
        <div className="flex gap-1">
          {rounds.map((r) => (
            <BuyTypeCell
              key={`t-${r.number}`}
              buyType={r.buyTypeT}
              round={r.number}
              side="T"
            />
          ))}
        </div>
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

          {/* Clutch banner */}
          {selectedClutch && <ClutchBanner clutch={selectedClutch} />}

          {/* Multi-kill highlight banners */}
          {selectedMultiKills.map((mk) => (
            <MultiKillBanner key={mk.steamId} multiKill={mk} />
          ))}

          {/* Opening duel summary */}
          {selectedFirstKill && (
            <OpeningDuelRow kill={selectedFirstKill} />
          )}

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

function BuyTypeCell({
  buyType,
  round,
  side,
}: {
  buyType: string;
  round: number;
  side: "CT" | "T";
}) {
  const key = (buyType as BuyTypeKey) ?? "UNKNOWN";
  const color = BUY_TYPE_COLORS[key] ?? BUY_TYPE_COLORS.UNKNOWN;
  const label = BUY_TYPE_LABELS[key] ?? "—";
  return (
    <div
      className="h-1.5 w-7 rounded-sm transition-all duration-150"
      style={{ backgroundColor: color, opacity: 0.65 }}
      title={`R${round} ${side}: ${label}`}
    />
  );
}

function ClutchBanner({ clutch }: { clutch: ClutchInfo }) {
  const teamColor = clutch.team === "CT" ? "var(--ct-blue)" : "var(--t-gold)";
  return (
    <div
      className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
        clutch.won
          ? "bg-[var(--success-muted)] text-[var(--success)]"
          : "bg-[rgba(255,255,255,0.04)] text-[var(--text-secondary)]"
      }`}
    >
      <Zap className="h-3.5 w-3.5" />
      <span className="font-semibold" style={{ color: teamColor }}>
        {clutch.playerName}
      </span>
      <span>&mdash;</span>
      <span className="font-bold">CLUTCH 1v{clutch.size}</span>
      <span className="font-bold uppercase">
        {clutch.won ? "WON" : "LOST"}
      </span>
    </div>
  );
}

function OpeningDuelRow({ kill }: { kill: KillData }) {
  const teamColor = kill.attackerTeam === "CT" ? "var(--ct-blue)" : "var(--t-gold)";
  return (
    <div className="mb-3 flex items-center gap-2 rounded-lg bg-[var(--warning-muted)] px-3 py-2 text-xs">
      <span className="rounded bg-[var(--warning)] px-1.5 py-0.5 text-[9px] font-black uppercase text-black">
        First
      </span>
      <span className="font-semibold" style={{ color: teamColor }}>
        {kill.attackerName}
      </span>
      <span className="text-[var(--text-tertiary)]">won opening duel vs</span>
      <span className="font-medium text-[var(--text-secondary)]">
        {kill.victimName}
      </span>
    </div>
  );
}

function MultiKillBanner({ multiKill }: { multiKill: MultiKill }) {
  const isAce = multiKill.type === "ace";
  const uniqueWeapons = [...new Set(multiKill.weapons)].join(", ");
  const label = isAce ? "ACE" : multiKill.type.toUpperCase();

  return (
    <div
      className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
        isAce
          ? "bg-[rgba(251,191,36,0.1)] text-[var(--t-gold)]"
          : "bg-[rgba(59,130,246,0.08)] text-[var(--ct-blue)]"
      }`}
    >
      <span className="text-base">{isAce ? "\u{1F525}" : "\u{1F3AF}"}</span>
      <span className="font-semibold text-[var(--text-primary)]">{multiKill.playerName}</span>
      <span>&mdash;</span>
      <span className="font-bold">{label}</span>
      <span className="text-[var(--text-tertiary)]">
        ({uniqueWeapons}, {multiKill.headshots} HS)
      </span>
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
      {kill.tradeKill && (
        <span
          className="rounded bg-[var(--info-muted)] px-1 py-0.5 text-[9px] font-bold text-[var(--info)]"
          title="Trade kill — avenged a teammate within 5s"
        >
          TRADE
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
      {kill.traded && (
        <span
          className="rounded bg-[var(--info-muted)] px-1 py-0.5 text-[9px] font-bold text-[var(--info)]"
          title="Death was traded — teammate avenged within 5s"
        >
          TRADED
        </span>
      )}
      {modifiers.length > 0 && (
        <span className="text-[10px] text-[var(--text-tertiary)]">
          ({modifiers.join(", ")})
        </span>
      )}
    </div>
  );
}
