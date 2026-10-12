"use client";

import { useState } from "react";
import { Crosshair, Shield, Flame, Target, Timer, Zap } from "lucide-react";
import type { MultiKill } from "@/lib/utils/multiKills";
import { BUY_TYPE_COLORS, type BuyTypeKey } from "@/lib/utils/buyType";
import { weaponDisplayName } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

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
  ELIMINATION: { label: "Eliminacja", icon: Crosshair },
  BOMB_EXPLODED: { label: "Wybuch bomby", icon: Flame },
  BOMB_DEFUSED: { label: "Bomba rozbrojona", icon: Shield },
  TIME_RAN_OUT: { label: "Koniec czasu", icon: Timer },
  TARGET_SAVED: { label: "Cel obroniony", icon: Shield },
};

/** Polish display labels for buy types (colors stay in `BUY_TYPE_COLORS`). */
const BUY_TYPE_DISPLAY: Record<BuyTypeKey, string> = {
  FULL_BUY: "Full buy",
  FORCE_BUY: "Force buy",
  HALF_BUY: "Półzakup",
  ECO: "Eco",
  PISTOL: "Pistolówka",
  UNKNOWN: "Nieznany",
};

const LEGEND_BUY_TYPES: BuyTypeKey[] = ["PISTOL", "FULL_BUY", "FORCE_BUY", "HALF_BUY", "ECO"];

const buyKey = (buyType: string): BuyTypeKey =>
  buyType in BUY_TYPE_DISPLAY ? (buyType as BuyTypeKey) : "UNKNOWN";

const winReasonLabel = (winReason: string) => WIN_REASON_LABELS[winReason]?.label ?? winReason;

const sideColor = (side: "CT" | "T" | null) =>
  side === "CT" ? "var(--ct-blue)" : side === "T" ? "var(--t-gold)" : "var(--text-primary)";

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
      <div className="mb-2 flex min-h-8 items-center gap-2">
        <p className="label-overline text-[var(--text-tertiary)]">Oś rund</p>
        {selectedRound !== null && (
          <button
            type="button"
            onClick={() => setSelectedRound(null)}
            className="rounded-md px-2 py-1 text-xs text-[var(--accent)] hover:underline max-md:min-h-11"
          >
            wyczyść
          </button>
        )}
      </div>

      {/* One column per round: chip on top, CT and T buy strips below.
          Scrolls sideways inside the card on phones, wraps on wider screens. */}
      <div
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
        role="group"
        aria-label="Rundy"
      >
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
            `Runda ${r.number}: ${r.winner} (${winReasonLabel(r.winReason)})`,
          ];
          if (bestMk) titleParts.push(`${bestMk.playerName} ${bestMk.type.toUpperCase()}`);
          if (clutch) {
            titleParts.push(
              `${clutch.playerName} 1v${clutch.size} ${clutch.won ? "wygrany" : "przegrany"}`
            );
          }
          titleParts.push(
            `zakup CT: ${BUY_TYPE_DISPLAY[buyKey(r.buyTypeCT)]}, T: ${BUY_TYPE_DISPLAY[buyKey(r.buyTypeT)]}`
          );

          return (
            <div key={r.number} className="flex shrink-0 flex-col gap-0.5">
              <button
                type="button"
                onClick={() => setSelectedRound(isSelected ? null : r.number)}
                aria-pressed={isSelected}
                aria-label={titleParts.join(" — ")}
                title={titleParts.join(" — ")}
                className={cn(
                  "relative flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-md px-1 font-mono text-xs font-bold tabular-nums transition-all",
                  r.winner === "CT"
                    ? isSelected
                      ? "bg-[var(--ct-blue)] text-[var(--on-accent)] ring-2 ring-[var(--ct-blue)] ring-offset-1 ring-offset-[var(--surface-1)]"
                      : "bg-[var(--ct-blue-muted)] text-[var(--ct-blue)] hover:bg-[var(--ct-blue)] hover:text-[var(--on-accent)]"
                    : isSelected
                      ? "bg-[var(--t-gold)] text-[var(--on-accent)] ring-2 ring-[var(--t-gold)] ring-offset-1 ring-offset-[var(--surface-1)]"
                      : "bg-[var(--t-gold-muted)] text-[var(--t-gold)] hover:bg-[var(--t-gold)] hover:text-[var(--on-accent)]",
                  hasAce && !isSelected && "shadow-[0_0_0_1.5px_var(--accent)_inset]"
                )}
              >
                {r.number}
                {bestMk && (
                  <span
                    className={cn(
                      "text-[9px] font-black uppercase",
                      hasAce && !isSelected ? "text-[var(--accent)]" : "opacity-80"
                    )}
                  >
                    {bestMk.type === "ace" ? "A" : bestMk.type}
                  </span>
                )}
                {showClutch && (
                  <span
                    className={cn(
                      "text-[9px] font-black uppercase",
                      clutch.won && !isSelected ? "text-[var(--good)]" : "opacity-60"
                    )}
                  >
                    1v{clutch.size}
                  </span>
                )}
              </button>
              <BuyTypeCell buyType={r.buyTypeCT} round={r.number} side="CT" />
              <BuyTypeCell buyType={r.buyTypeT} round={r.number} side="T" />
            </div>
          );
        })}
      </div>

      {/* Legend: buy strips (CT row, then T row) and chip markers */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-tertiary)]">
        <span>Paski: zakup CT (góra) i T (dół)</span>
        {LEGEND_BUY_TYPES.map((key) => (
          <span key={key} className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className="h-1.5 w-3 rounded-sm"
              style={{ backgroundColor: BUY_TYPE_COLORS[key], opacity: 0.65 }}
            />
            {BUY_TYPE_DISPLAY[key]}
          </span>
        ))}
        <span>
          <span className="font-mono font-bold text-[var(--text-secondary)]">3k/4k/A</span> — multi-kill/ace
        </span>
        <span>
          <span className="font-mono font-bold text-[var(--text-secondary)]">1vX</span> — clutch
        </span>
      </div>

      {/* Kill feed for selected round */}
      {selected && (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="font-display text-sm font-bold"
                style={{ color: sideColor(selected.winner) }}
              >
                Runda <span className="font-mono tabular-nums">{selected.number}</span>
              </span>
              <RoundReasonBadge winReason={selected.winReason} winner={selected.winner} />
            </div>
            <span className="text-xs text-[var(--text-tertiary)]">
              <span className="font-mono tabular-nums">{selected.kills.length}</span>{" "}
              {killsLabel(selected.kills.length)}
            </span>
          </div>

          {/* Buy types of the selected round */}
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-tertiary)]">
            <BuyTypeLabel side="CT" buyType={selected.buyTypeCT} />
            <BuyTypeLabel side="T" buyType={selected.buyTypeT} />
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
            <p className="text-xs text-[var(--text-tertiary)]">Brak zabójstw w tej rundzie</p>
          ) : (
            <ol className="divide-y divide-[var(--divider)]">
              {selected.kills.map((k, i) => (
                <KillFeedEntry key={i} kill={k} />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/** "1 zabójstwo", "3 zabójstwa", "5 zabójstw". */
function killsLabel(n: number): string {
  if (n === 1) return "zabójstwo";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "zabójstwa";
  return "zabójstw";
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
  const key = buyKey(buyType);
  const color = BUY_TYPE_COLORS[key] ?? BUY_TYPE_COLORS.UNKNOWN;
  return (
    <div
      className="h-1.5 w-full rounded-sm transition-all duration-150"
      style={{ backgroundColor: color, opacity: 0.65 }}
      title={`R${round} ${side}: ${BUY_TYPE_DISPLAY[key]}`}
    />
  );
}

function BuyTypeLabel({ side, buyType }: { side: "CT" | "T"; buyType: string }) {
  const key = buyKey(buyType);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-semibold" style={{ color: sideColor(side) }}>
        {side}
      </span>
      <span
        aria-hidden
        className="h-1.5 w-3 rounded-sm"
        style={{ backgroundColor: BUY_TYPE_COLORS[key], opacity: 0.65 }}
      />
      <span className="text-[var(--text-secondary)]">{BUY_TYPE_DISPLAY[key]}</span>
    </span>
  );
}

function ClutchBanner({ clutch }: { clutch: ClutchInfo }) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-xs font-medium",
        clutch.won
          ? "bg-[var(--good-muted)] text-[var(--good)]"
          : "bg-[rgba(190,160,255,0.04)] text-[var(--text-secondary)]"
      )}
    >
      <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate font-semibold" style={{ color: sideColor(clutch.team) }}>
        {clutch.playerName}
      </span>
      <span aria-hidden>&mdash;</span>
      <span className="font-bold">
        CLUTCH <span className="font-mono tabular-nums">1v{clutch.size}</span>
      </span>
      <span className="font-bold uppercase">
        {clutch.won ? "wygrany" : "przegrany"}
      </span>
    </div>
  );
}

function OpeningDuelRow({ kill }: { kill: KillData }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-[var(--accent-muted)] px-3 py-2 text-xs">
      <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-black uppercase text-[var(--on-accent)]">
        Otwarcie
      </span>
      <span className="min-w-0 truncate font-semibold" style={{ color: sideColor(kill.attackerTeam) }}>
        {kill.attackerName}
      </span>
      <span className="text-[var(--text-tertiary)]">wygrał pojedynek otwierający z</span>
      <span className="min-w-0 truncate font-medium text-[var(--text-secondary)]">
        {kill.victimName}
      </span>
    </div>
  );
}

function MultiKillBanner({ multiKill }: { multiKill: MultiKill }) {
  const isAce = multiKill.type === "ace";
  const uniqueWeapons = [...new Set(multiKill.weapons.map(weaponDisplayName))].join(", ");
  const label = isAce ? "ACE" : multiKill.type.toUpperCase();
  const Icon = isAce ? Flame : Target;

  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-xs font-medium text-[var(--accent)]",
        isAce ? "bg-[var(--accent-muted)]" : "bg-[rgba(155,107,255,0.08)]"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate font-semibold text-[var(--text-primary)]">{multiKill.playerName}</span>
      <span aria-hidden>&mdash;</span>
      <span className="font-bold">{label}</span>
      <span className="text-[var(--text-tertiary)]">
        ({uniqueWeapons}, <span className="font-mono tabular-nums">{multiKill.headshots}</span> HS)
      </span>
    </div>
  );
}

function RoundReasonBadge({ winReason, winner }: { winReason: string; winner: "CT" | "T" }) {
  const info = WIN_REASON_LABELS[winReason];
  const Icon = info?.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        winner === "CT"
          ? "bg-[var(--ct-blue-muted)] text-[var(--ct-blue)]"
          : "bg-[var(--t-gold-muted)] text-[var(--t-gold)]"
      )}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {winner} · {info?.label ?? winReason}
    </span>
  );
}

function KillFeedEntry({ kill }: { kill: KillData }) {
  const modifiers: string[] = [];
  if (kill.headshot) modifiers.push("HS");
  if (kill.wallbang) modifiers.push("przez ścianę");
  if (kill.throughSmoke) modifiers.push("przez smoke");
  if (kill.noScope) modifiers.push("no-scope");

  const victimTeam = kill.attackerTeam === "CT" ? "T" : kill.attackerTeam === "T" ? "CT" : null;

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-xs">
      {kill.isFirstKill && (
        <span
          className="rounded bg-[var(--accent-muted)] px-1 py-0.5 text-[10px] font-bold text-[var(--accent)]"
          title="Pierwsze zabójstwo rundy"
        >
          FK
        </span>
      )}
      {kill.tradeKill && (
        <span
          className="rounded bg-[var(--info-muted)] px-1 py-0.5 text-[10px] font-bold text-[var(--info)]"
          title="Trade — pomścił kolegę w ciągu 5 s"
        >
          TRADE
        </span>
      )}
      <span className="min-w-0 max-w-[40%] truncate font-medium" style={{ color: sideColor(kill.attackerTeam) }}>
        {kill.attackerName}
      </span>
      <span className="flex items-center gap-1">
        <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
          {weaponDisplayName(kill.weapon)}
        </span>
        {kill.headshot && (
          <span className="text-[var(--accent)]" title="Headshot" aria-hidden>
            ●
          </span>
        )}
      </span>
      <span
        className="min-w-0 max-w-[40%] truncate font-medium opacity-80"
        style={{ color: sideColor(victimTeam) }}
      >
        {kill.victimName}
      </span>
      {kill.traded && (
        <span
          className="rounded bg-[var(--info-muted)] px-1 py-0.5 text-[10px] font-bold text-[var(--info)]"
          title="Śmierć pomszczona — kolega oddał trade w ciągu 5 s"
        >
          POMSZCZONY
        </span>
      )}
      {modifiers.length > 0 && (
        <span className="text-[11px] text-[var(--text-tertiary)]">
          ({modifiers.join(", ")})
        </span>
      )}
    </li>
  );
}
