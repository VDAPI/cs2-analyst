"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bomb, ClipboardCheck, Maximize, Skull, Target } from "lucide-react";
import { KinoLayout } from "./kino-layout";
import { PlaylistBar, type ReplayPlaylist } from "./playlist-bar";
import { useReplayStore, TICK_RATE } from "@/stores/replay-store";
import type { PlayerSnapshot, TickFrame } from "@/stores/replay-store";
import { PlaybackControls } from "./playback-controls";
import { MapViewport } from "@/components/maps/map-viewport";
import { useCanvasUiScale, useRadarImage } from "@/components/maps/use-canvas";
import { ToolHeader } from "@/components/tools/tool-header";
import { drawRadarBackground, makeCanvasToWorld, makeWorldToCanvas, TOOL_CANVAS_SIZE, type RadarConfig } from "@/lib/canvas/radar";
import {
  PLAYER_RADIUS,
  VIEW_CONE_UNITS,
  activeBomb,
  drawActiveFires,
  drawActiveSmokes,
  drawBombMarker,
  drawFlashOverlay,
  drawGrenadeTrajectories,
  drawHEExplosions,
  drawKillMarker,
  drawNotePin,
  drawPlayer,
  drawFindingMarker,
  drawPlayerLoadout,
  drawSightLine,
  drawUtilityTimers,
  drawViewCone,
  type LabelRect,
} from "@/lib/canvas/replay-draw";
import { FindingTag } from "@/components/ui";
import { fmtRoundTime, type FindingView } from "@/lib/findings/view";
import { useT } from "@/lib/i18n/client";
import { hasLineupPractice } from "@/lib/training/lineup-trainer";
import { cn } from "@/lib/utils/cn";
import { MomentTools, useMapNotes, type MapNoteView, type NoteMode } from "./moment-tools";

interface RoundInfo {
  number: number;
  winner: "CT" | "T";
  winReason: string;
  ctScore: number;
  tScore: number;
}

interface PlayerInfo {
  steamId: string;
  name: string;
  team: "CT" | "T";
}

interface ReplayViewerProps {
  matchId: string;
  /** Rounds picked in the team analysis to step through. */
  playlist?: ReplayPlaylist | null;
  mapName: string;
  mapConfig: RadarConfig | null;
  rounds: RoundInfo[];
  players: PlayerInfo[];
  scoreCT: number;
  scoreT: number;
  /** Round to open first (deep link). */
  initialRound?: number;
  /** Tick to jump to in initialRound; playback starts a moment before it. */
  initialTick?: number | null;
  /** Player selected on open (deep link, or the viewer if they played). */
  initialPlayer?: string | null;
  /** Finding to highlight on open (from a report card). */
  initialFindingId?: string | null;
  /** A teammate's match (S17): no notes or share links, those belong to the uploader. */
  readOnly?: boolean;
}

/** Seconds of lead-in shown before a deep-linked tick. */
const DEEP_LINK_LEAD_S = 2;
/** Kill markers glow for this long after the kill. */
const FRESH_KILL_TICKS = 2 * TICK_RATE;
/** Tap tolerance around a player dot, in canvas pixels. */
const TAP_RADIUS = PLAYER_RADIUS * 3;
/** A map note's pin glows this close to its moment. */
const NOTE_ACTIVE_TICKS = 3 * TICK_RATE;
/** A mistake marker shows at full strength this close to its tick, fading out by FINDING_FADE_S. */
const FINDING_FULL_S = 0.75;
const FINDING_FADE_S = 2;

/** Strength (0–1) of a finding's marker at `tick`. */
function findingStrength(f: FindingView, tick: number): number {
  const dt = Math.abs(tick - f.tick) / TICK_RATE;
  if (dt <= FINDING_FULL_S) return 1;
  return Math.max(0, 1 - (dt - FINDING_FULL_S) / (FINDING_FADE_S - FINDING_FULL_S));
}

/** Shortest turn from `a` to `b` in degrees, `t` of the way. */
function lerpYaw(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}

/** A frame `alpha` (0–1) of the way from `a` to `b`: players alive in both move, the rest stay. */
function interpolateFrame(a: TickFrame, b: TickFrame, alpha: number): TickFrame {
  const nextOf = new Map(b.players.map((p) => [p.steamId, p]));
  return {
    tick: a.tick + (b.tick - a.tick) * alpha,
    players: a.players.map((p) => {
      const q = nextOf.get(p.steamId);
      if (!q || !p.isAlive || !q.isAlive) return p;
      return { ...p, x: p.x + (q.x - p.x) * alpha, y: p.y + (q.y - p.y) * alpha, yaw: lerpYaw(p.yaw, q.yaw, alpha) };
    }),
  };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function winReasonLabel(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("defus")) return "rozbrojenie";
  if (r.includes("explod") || r.includes("bomb")) return "wybuch bomby";
  if (r.includes("time")) return "koniec czasu";
  if (r.includes("elim") || r.includes("kill") || r.includes("win")) return "eliminacja";
  return reason.replace(/_/g, " ").toLowerCase();
}

export function ReplayViewer({
  playlist,
  matchId,
  mapName,
  mapConfig,
  rounds,
  players,
  scoreCT,
  scoreT,
  initialRound = 1,
  initialTick = null,
  initialPlayer = null,
  initialFindingId = null,
  readOnly = false,
}: ReplayViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTickTimeRef = useRef<number>(0);
  const radar = useRadarImage(mapConfig?.radarImage);
  const worldToCanvas = useMemo(() => makeWorldToCanvas(mapConfig), [mapConfig]);
  const canvasToWorld = useMemo(() => makeCanvasToWorld(mapConfig), [mapConfig]);
  const { notes, add: addNote, remove: removeNote } = useMapNotes(matchId);
  const [noteMode, setNoteMode] = useState<NoteMode>("off");
  const [pendingNote, setPendingNote] = useState<{ x: number; y: number } | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [zoom, setZoom] = useState(1);
  const ui = useCanvasUiScale(canvasRef, zoom, 980);
  const [kino, setKino] = useState(false);
  // ?view=full opens the big view; F toggles it, Escape leaves it.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "full") setKino(true);
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (e.key === "f" || e.key === "F") setKino((k) => !k);
      else if (e.key === "Escape" && !document.fullscreenElement) setKino(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const {
    frames,
    kills,
    grenadeEvents,
    bombEvents,
    currentFrameIndex,
    currentRound,
    isPlaying,
    playbackSpeed,
    showPlayerNames,
    showGrenades,
    showFov,
    selectedSteamId,
    findings,
    activeFindingId,
    isLoading,
    loadRound,
    nextFrame,
    togglePlay,
    seekSeconds,
    selectPlayer,
    setActiveFinding,
    reset,
  } = useReplayStore();

  // Load the first (or deep-linked) round on mount
  useEffect(() => {
    const store = useReplayStore.getState();
    if (initialPlayer) store.setSelectedPlayer(initialPlayer);
    if (initialFindingId) store.setActiveFinding(initialFindingId);
    store.loadFindings(matchId);
    const round = rounds.some((r) => r.number === initialRound) ? initialRound : 1;
    loadRound(matchId, round).then(() => {
      if (initialTick == null || round !== initialRound) return;
      const { frames: loaded, setFrameIndex } = useReplayStore.getState();
      const target = initialTick - DEEP_LINK_LEAD_S * TICK_RATE;
      const idx = loaded.findIndex((f) => f.tick >= target);
      if (idx > 0) setFrameIndex(idx);
    });
    return () => {
      reset();
    };
    // Deep-link params only apply on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, loadRound, reset]);

  const frame = frames[currentFrameIndex];
  const currentTick = frame?.tick ?? 0;

  // Mistakes in this round: the selected player's, or everyone's when nobody is selected.
  const roundFindings = useMemo(
    () =>
      findings.filter(
        (f) => f.roundNumber === currentRound && (!selectedSteamId || f.steamId === selectedSteamId)
      ),
    [findings, currentRound, selectedSteamId]
  );
  // A note in progress belongs to the round it was started in.
  useEffect(() => {
    setNoteMode("off");
    setPendingNote(null);
  }, [currentRound]);
  const roundNotes = useMemo(() => notes.filter((n) => n.roundNumber === currentRound), [notes, currentRound]);
  const conePx = useMemo(() => {
    const a = worldToCanvas(0, 0);
    const b = worldToCanvas(VIEW_CONE_UNITS, 0);
    return Math.hypot(b.x - a.x, b.y - a.y);
  }, [worldToCanvas]);

  // Draw the current frame. During playback the loop below also calls the
  // latest `draw` between store frames with `alpha` (0–1 of the way to the
  // next frame), so players glide at the screen's rate instead of jumping
  // once per stored frame (every 4 ticks).
  const drawRef = useRef<(alpha: number) => void>(() => {});
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { width, height } = ctx.canvas;
    const next = frames[currentFrameIndex + 1];

    const draw = (alpha: number) => {
      const shown = frame && next && alpha > 0 ? interpolateFrame(frame, next, alpha) : frame;
      const tickNow = shown?.tick ?? currentTick;

      drawRadarBackground(ctx, radar, 0.6, mapName);
      if (!shown) return;

      if (showGrenades) {
        drawActiveSmokes(ctx, grenadeEvents, tickNow, worldToCanvas);
        drawActiveFires(ctx, grenadeEvents, tickNow, worldToCanvas);
        drawUtilityTimers(ctx, grenadeEvents, tickNow, worldToCanvas, ui);
        drawGrenadeTrajectories(ctx, grenadeEvents, tickNow, worldToCanvas);
      }

      if (showFov) {
        for (const p of shown.players) {
          if (!p.isAlive) continue;
          if (selectedSteamId && p.steamId !== selectedSteamId) continue;
          const pos = worldToCanvas(p.x, p.y);
          drawViewCone(ctx, pos.x, pos.y, p.yaw, p.team, conePx, p.steamId === selectedSteamId);
        }
      }

      // Mistake around now: line to the enemy it was about.
      const live = roundFindings
        .map((f) => ({ f, strength: f.id === activeFindingId ? Math.max(0.35, findingStrength(f, tickNow)) : findingStrength(f, tickNow) }))
        .filter((x) => x.strength > 0);
      for (const { f } of live) {
        if (!f.targetSteamId) continue;
        const me = shown.players.find((p) => p.steamId === f.steamId);
        const foe = shown.players.find((p) => p.steamId === f.targetSteamId);
        if (me?.isAlive && foe?.isAlive) {
          drawSightLine(ctx, worldToCanvas(me.x, me.y), worldToCanvas(foe.x, foe.y), ui);
        }
      }

      for (const kill of kills) {
        if (kill.tick > tickNow) continue;
        const pos = worldToCanvas(kill.victimX, kill.victimY);
        drawKillMarker(ctx, pos.x, pos.y, tickNow - kill.tick < FRESH_KILL_TICKS, ui);
      }

      if (showGrenades) {
        drawBombMarker(ctx, bombEvents, tickNow, worldToCanvas, ui);
        drawHEExplosions(ctx, grenadeEvents, tickNow, worldToCanvas);
      }

      // Selected player last so the ring and name sit on top
      const ordered = [...shown.players].sort(
        (a, b) => Number(a.steamId === selectedSteamId) - Number(b.steamId === selectedSteamId)
      );
      const slots = playerSlots(shown.players);
      const labels: LabelRect[] = [];
      for (const p of ordered) {
        const pos = worldToCanvas(p.x, p.y);
        drawPlayer(ctx, pos.x, pos.y, p, showPlayerNames, p.steamId === selectedSteamId, tickNow, ui, slots.get(p.steamId), labels);
        if (p.steamId === selectedSteamId) drawPlayerLoadout(ctx, pos.x, pos.y, p, ui);
      }
      for (const { f, strength } of live) {
        const p = shown.players.find((x) => x.steamId === f.steamId);
        if (!p) continue;
        const pos = worldToCanvas(p.x, p.y);
        drawFindingMarker(ctx, pos.x, pos.y, f.severity, tickNow, strength, ui);
      }

      roundNotes.forEach((n, i) => {
        const pos = worldToCanvas(n.x, n.y);
        drawNotePin(ctx, pos.x, pos.y, String(i + 1), Math.abs(tickNow - n.tick) <= NOTE_ACTIVE_TICKS, ui);
      });
      if (pendingNote) {
        const pos = worldToCanvas(pendingNote.x, pendingNote.y);
        drawNotePin(ctx, pos.x, pos.y, "+", true, ui);
      }

      if (showGrenades) {
        drawFlashOverlay(ctx, grenadeEvents, tickNow, width, height, worldToCanvas, !reducedMotion);
      }
    };
    drawRef.current = draw;
    draw(0);
  }, [frame, frames, currentFrameIndex, currentTick, kills, grenadeEvents, bombEvents, showGrenades, showPlayerNames, showFov, selectedSteamId, roundFindings, activeFindingId, conePx, worldToCanvas, radar, mapName, reducedMotion, ui, roundNotes, pendingNote]);

  // Playback loop; pauses while the tab is hidden
  useEffect(() => {
    if (!isPlaying || frames.length < 2) return;
    const ticksPerFrame = Math.max(1, frames[1].tick - frames[0].tick);
    const msPerFrame = (ticksPerFrame / TICK_RATE / playbackSpeed) * 1000;

    const animate = (time: number) => {
      const alpha = (time - lastTickTimeRef.current) / msPerFrame;
      if (alpha >= 1) {
        lastTickTimeRef.current = time;
        nextFrame();
      } else {
        drawRef.current(alpha);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    lastTickTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(animate);

    const onVisibility = () => {
      if (document.hidden && useReplayStore.getState().isPlaying) togglePlay();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isPlaying, playbackSpeed, nextFrame, frames, togglePlay]);

  // Keyboard: Space play/pause, ←/→ 5 s, Shift+←/→ round
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        if (t instanceof HTMLButtonElement) return;
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        e.preventDefault();
        if (e.shiftKey) {
          const { currentRound: cr, isLoading: busy } = useReplayStore.getState();
          const next = cr + dir;
          if (!busy && next >= 1 && next <= rounds.length) loadRound(matchId, next);
        } else {
          seekSeconds(5 * dir);
        }
      } else if (e.key === "Escape") {
        selectPlayer(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlay, seekSeconds, selectPlayer, loadRound, matchId, rounds.length]);

  /** Jump to a mistake: its round, a moment before it, its player selected. */
  const goToFinding = (f: FindingView) => {
    const store = useReplayStore.getState();
    store.setSelectedPlayer(f.steamId);
    setActiveFinding(f.id);
    const seek = () => {
      const { frames: loaded, setFrameIndex } = useReplayStore.getState();
      const idx = loaded.findIndex((fr) => fr.tick >= f.tick - DEEP_LINK_LEAD_S * TICK_RATE);
      setFrameIndex(Math.max(0, idx));
    };
    if (f.roundNumber !== store.currentRound) {
      if (!store.isLoading) loadRound(matchId, f.roundNumber).then(seek);
    } else {
      seek();
    }
  };

  /** Jump to a note: a moment before it, paused there. */
  const goToNote = (n: MapNoteView) => {
    const { frames: loaded, setFrameIndex, isPlaying: playing } = useReplayStore.getState();
    const idx = loaded.findIndex((fr) => fr.tick >= n.tick - TICK_RATE);
    setFrameIndex(Math.max(0, idx));
    if (playing) togglePlay();
  };

  const changeNoteMode = (mode: NoteMode) => {
    setNoteMode(mode);
    if (mode !== "typing") setPendingNote(null);
    // Pause while placing so the note gets the moment the player picked.
    if (mode === "placing" && useReplayStore.getState().isPlaying) togglePlay();
  };

  const saveNote = async (text: string) => {
    if (!pendingNote) return;
    await addNote({ round: currentRound, tick: Math.round(currentTick), x: pendingNote.x, y: pendingNote.y, text });
    setPendingNote(null);
    setNoteMode("off");
  };

  const onTap = ({ x, y }: { x: number; y: number }) => {
    if (noteMode !== "off") {
      setPendingNote(canvasToWorld(x, y));
      setNoteMode("typing");
      return;
    }
    if (!frame) return;
    let best: PlayerSnapshot | null = null;
    let bestDist = TAP_RADIUS * ui;
    for (const p of frame.players) {
      const pos = worldToCanvas(p.x, p.y);
      const d = Math.hypot(pos.x - x, pos.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (best) selectPlayer(best.steamId);
    else if (selectedSteamId) selectPlayer(null);
  };

  const roundInfo = rounds.find((r) => r.number === currentRound);
  const firstTick = frames[0]?.tick ?? 0;
  const elapsed = Math.max(0, (currentTick - firstTick) / TICK_RATE);
  const bomb = showGrenades ? activeBomb(bombEvents, currentTick) : null;
  const visibleKills = kills.filter((k) => k.tick <= currentTick);

  const nameOf = useMemo(() => new Map(players.map((p) => [p.steamId, p.name])), [players]);
  // The mistake shown in the canvas badge: the picked one while near, else the nearest.
  const nowFinding = useMemo(() => {
    let best: FindingView | null = null;
    let bestScore = 0;
    for (const f of roundFindings) {
      const s = findingStrength(f, currentTick) + (f.id === activeFindingId ? 0.5 : 0);
      if (findingStrength(f, currentTick) > 0 && s > bestScore) {
        best = f;
        bestScore = s;
      }
    }
    return best;
  }, [roundFindings, currentTick, activeFindingId]);

  const livePlayers = frame?.players ?? [];
  const sideList = (side: "CT" | "T") =>
    livePlayers.length > 0
      ? livePlayers.filter((p) => p.team === side)
      : players.filter((p) => p.team === side).map((p) => ({ ...p, health: 100, isAlive: true, weapon: "", x: 0, y: 0, z: 0, yaw: 0 }));
  const aliveCount = (side: "CT" | "T") => livePlayers.filter((p) => p.team === side && p.isAlive).length;

  const mapView = (
    <MapViewport
      onZoomChange={setZoom}
      canvasRef={canvasRef}
      size={TOOL_CANVAS_SIZE}
      onTap={onTap}
      label={`Replay 2D, runda ${currentRound}, mapa ${mapName}`}
    >
      <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--glass-bg)] px-2.5 py-1.5 backdrop-blur-md">
          <span className="font-display text-sm font-semibold text-[var(--text-primary)]">R{currentRound}</span>
          <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, "0")}
          </span>
        </div>
        {livePlayers.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--glass-bg)] px-2.5 py-1 font-mono text-sm font-semibold tabular-nums backdrop-blur-md">
            <span className="text-[var(--ct-blue)]">{aliveCount("CT")}</span>
            <span className="text-[var(--text-disabled)]">vs</span>
            <span className="text-[var(--t-gold)]">{aliveCount("T")}</span>
          </div>
        )}
        {bomb && (
          <div className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,194,61,0.4)] bg-[var(--glass-bg)] px-2.5 py-1 backdrop-blur-md">
            <Bomb className="h-3.5 w-3.5 text-[var(--t-gold)]" />
            <span className="font-mono text-sm tabular-nums text-[var(--t-gold)]">{bomb.remaining.toFixed(1)} s</span>
            {bomb.event.site && <span className="text-xs text-[var(--text-tertiary)]">{bomb.event.site}</span>}
          </div>
        )}
      </div>
      {nowFinding && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex justify-center">
          <div className="flex max-w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--glass-bg)] px-2.5 py-1.5 backdrop-blur-md">
            <FindingTag severity={nowFinding.severity} className="shrink-0 whitespace-nowrap">
              {nowFinding.label}
            </FindingTag>
            <span className="hidden truncate text-xs text-[var(--text-secondary)] sm:inline">
              {selectedSteamId ? nowFinding.detail : `${nameOf.get(nowFinding.steamId) ?? ""}: ${nowFinding.detail}`}
            </span>
          </div>
        </div>
      )}
    </MapViewport>
  );
  const killFeed = (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 sm:col-span-2 lg:col-span-1">
      <p className="label-overline mb-2 text-[var(--text-tertiary)]">Killfeed</p>
      {visibleKills.length === 0 ? (
        <p className="text-[13px] text-[var(--text-tertiary)]">Jeszcze nikt nie zginął w tej rundzie.</p>
      ) : (
        <ul className="max-h-[200px] space-y-1 overflow-y-auto">
          {visibleKills.map((k, i) => (
            <li key={`${k.tick}-${i}`} className="flex min-w-0 items-center gap-1.5 text-[13px]">
              <span className="truncate font-mono text-[var(--text-primary)]">{k.attackerName || "świat"}</span>
              <span className="shrink-0 text-[var(--text-tertiary)]">{k.weapon}</span>
              {k.headshot && (
                <span className="shrink-0 rounded-full bg-[var(--accent-2-muted)] px-1.5 text-[11px] font-semibold text-[var(--accent-2)]">HS</span>
              )}
              <Skull className="h-3.5 w-3.5 shrink-0 text-[var(--mistake)]" aria-label="zabił" />
              <span className="truncate font-mono text-[var(--text-tertiary)]">{k.victimName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  const findingsPanel = (
    <FindingsPanel
      matchId={matchId}
      findings={roundFindings}
      allCount={findings.filter((f) => !selectedSteamId || f.steamId === selectedSteamId).length}
      activeId={nowFinding?.id ?? activeFindingId}
      selectedName={selectedSteamId ? nameOf.get(selectedSteamId) ?? null : null}
      selectedSteamId={selectedSteamId}
      nameOf={nameOf}
      onPick={goToFinding}
    />
  );
  const roundInfoBox = (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 sm:col-span-2 lg:col-span-1">
      {roundInfo ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Rundę {roundInfo.number} wygrali{" "}
          <span className={cn("font-semibold", roundInfo.winner === "CT" ? "text-[var(--ct-blue)]" : "text-[var(--t-gold)]")}>
            {roundInfo.winner}
          </span>{" "}
          · {winReasonLabel(roundInfo.winReason)} ·{" "}
          <span className="font-mono tabular-nums">
            {roundInfo.ctScore}:{roundInfo.tScore}
          </span>
        </p>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">Wybierz rundę.</p>
      )}
    </div>
  );
  const controls = <PlaybackControls matchId={matchId} rounds={rounds} findingMarks={roundFindings} onFinding={goToFinding} />;

  if (kino) {
    return (
      <KinoLayout
        mapName={mapName}
        scoreCT={scoreCT}
        scoreT={scoreT}
        rounds={rounds}
        currentRound={currentRound}
        loading={isLoading}
        onRound={(n) => {
          if (!useReplayStore.getState().isLoading) loadRound(matchId, n);
        }}
        onClose={() => setKino(false)}
        extra={playlist ? <PlaylistBar playlist={playlist} /> : null}
        map={mapView}
        controls={<PlaybackControls matchId={matchId} rounds={rounds} findingMarks={roundFindings} onFinding={goToFinding} compact />}
        left={
          <>
            <SidePanel side="CT" players={sideList("CT")} selectedSteamId={selectedSteamId} onSelect={selectPlayer} large />
            {roundInfoBox}
            {findingsPanel}
          </>
        }
        right={
          <>
            <SidePanel side="T" players={sideList("T")} selectedSteamId={selectedSteamId} onSelect={selectPlayer} large />
            {killFeed}
          </>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ToolHeader
        backHref="/replay"
        backLabel="Replay 2D"
        overline="Replay 2D"
        title={mapName}
        scoreCT={scoreCT}
        scoreT={scoreT}
        loading={isLoading}
        loadingLabel="Ładowanie rundy…"
      />
      {playlist && <PlaylistBar playlist={playlist} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-2" />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,760px)_minmax(260px,1fr)] lg:items-start">
        <div className="min-w-0 space-y-3">
          {mapView}

          {controls}

          <button
            type="button"
            onClick={() => setKino(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--text-primary)] hover:border-[var(--border-hover)]"
          >
            <Maximize className="h-4 w-4" aria-hidden />
            Duży podgląd (F)
          </button>
          <p className="hidden text-[13px] text-[var(--text-tertiary)] md:block">
            Spacja: start/pauza · ←/→: 5 s · Shift+←/→: runda · kliknij gracza, aby go wyróżnić · Ctrl+kółko: zoom
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {roundInfoBox}

          {findingsPanel}

          {!readOnly && (
            <MomentTools
              matchId={matchId}
              round={currentRound}
              tick={currentTick}
              roundStartTick={firstTick}
              selectedSteamId={selectedSteamId}
              notes={roundNotes}
              mode={noteMode}
              pending={pendingNote}
              onModeChange={changeNoteMode}
              onSave={saveNote}
              onRemove={removeNote}
              onJump={goToNote}
            />
          )}

          <SidePanel
            side="CT"
            players={sideList("CT")}
            selectedSteamId={selectedSteamId}
            onSelect={selectPlayer}
          />
          <SidePanel
            side="T"
            players={sideList("T")}
            selectedSteamId={selectedSteamId}
            onSelect={selectPlayer}
          />

          {killFeed}
        </div>
      </div>
    </div>
  );
}

/** 1–5 per team in the frame's order, the same order as the side lists. */
function playerSlots(players: PlayerSnapshot[]): Map<string, number> {
  const count = { CT: 0, T: 0 };
  return new Map(players.map((p) => [p.steamId, ++count[p.team]]));
}

function SidePanel({
  side,
  players,
  selectedSteamId,
  onSelect,
  large,
}: {
  side: "CT" | "T";
  players: PlayerSnapshot[];
  selectedSteamId: string | null;
  onSelect: (steamId: string) => void;
  /** Big view: larger rows, weapon always shown. */
  large?: boolean;
}) {
  const isCT = side === "CT";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
      <div
        className={cn(
          "mb-1.5 flex items-center gap-2 rounded-md px-2 py-1",
          isCT ? "bg-[var(--ct-blue-muted)] text-[var(--ct-blue)]" : "bg-[var(--t-gold-muted)] text-[var(--t-gold)]"
        )}
      >
        <span className={cn("h-2 w-2 rounded-full", isCT ? "bg-[var(--ct-blue)]" : "bg-[var(--t-gold)]")} />
        <span className="label-overline">{isCT ? "Counter-Terrorists" : "Terrorists"}</span>
      </div>
      <ul className="space-y-0.5">
        {players.map((p, i) => (
          <li key={p.steamId}>
            <PlayerRow player={p} slot={i + 1} selected={p.steamId === selectedSteamId} onSelect={onSelect} large={large} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlayerRow({
  player,
  slot,
  selected,
  onSelect,
  large,
}: {
  player: PlayerSnapshot;
  /** Number drawn on the player's token on the map. */
  slot: number;
  selected: boolean;
  onSelect: (steamId: string) => void;
  large?: boolean;
}) {
  const dead = !player.isAlive;
  const color = player.team === "CT" ? "var(--ct-blue)" : "var(--t-gold)";
  return (
    <button
      type="button"
      onClick={() => onSelect(player.steamId)}
      aria-pressed={selected}
      className={cn(
        "flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors duration-150 md:min-h-9",
        large && "min-h-12 text-[15px] md:min-h-11",
        selected ? "bg-[var(--accent-muted)] ring-1 ring-[var(--accent)]" : "hover:bg-[var(--surface-2)]",
        dead && !selected && "opacity-45"
      )}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold text-[var(--on-accent)]"
        style={{ backgroundColor: color }}
      >
        {slot}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-secondary)]">{player.name}</span>
      {player.weapon && !dead && (
        <span className={cn("hidden max-w-[80px] truncate text-xs text-[var(--text-tertiary)] sm:inline", large && "inline max-w-[110px] text-[13px]")}>
          {player.weapon.replace(/^weapon_/, "")}
        </span>
      )}
      {dead ? (
        <span className="font-mono text-xs font-semibold text-[var(--mistake)]">✕</span>
      ) : (
        <>
          <span className="w-7 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{player.health}</span>
          <span className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--surface-4)]">
            <span
              className="block h-full rounded-full"
              style={{ width: `${player.health}%`, backgroundColor:
                  player.health > 50 ? "var(--good)" : player.health > 25 ? "var(--warning)" : "var(--mistake)",
               }}
            />
          </span>
        </>
      )}
    </button>
  );
}

function FindingsPanel({
  matchId,
  findings,
  allCount,
  activeId,
  selectedName,
  selectedSteamId,
  nameOf,
  onPick,
}: {
  matchId: string;
  findings: FindingView[];
  allCount: number;
  activeId: string | null;
  selectedName: string | null;
  selectedSteamId: string | null;
  nameOf: Map<string, string>;
  onPick: (f: FindingView) => void;
}) {
  const active = findings.find((f) => f.id === activeId) ?? null;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 sm:col-span-2 lg:col-span-1">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="label-overline text-[var(--text-tertiary)]">
          Błędy w rundzie{selectedName ? ` · ${selectedName}` : ""}
        </p>
        <Link
          href={`/report/${matchId}${selectedSteamId ? `?player=${selectedSteamId}` : ""}`}
          className="flex min-h-9 items-center gap-1 text-xs font-medium text-[var(--accent-hover)] hover:underline"
        >
          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
          Raport
        </Link>
      </div>
      {findings.length === 0 ? (
        <p className="text-[13px] text-[var(--text-tertiary)]">
          {allCount === 0
            ? "Brak wykrytych błędów."
            : `W tej rundzie nic. W meczu: ${allCount}, zobacz znaczniki na osi czasu innych rund.`}
        </p>
      ) : (
        <ul className="max-h-[220px] space-y-1 overflow-y-auto">
          {findings.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onPick(f)}
                aria-current={f.id === activeId ? "true" : undefined}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors",
                  f.id === activeId ? "bg-[var(--accent-muted)] ring-1 ring-[var(--accent)]" : "hover:bg-[var(--surface-2)]"
                )}
              >
                <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{fmtRoundTime(f.roundTime)}</span>
                <FindingTag severity={f.severity} className="shrink-0">
                  {f.label}
                </FindingTag>
                {!selectedSteamId && (
                  <span className="min-w-0 truncate font-mono text-xs text-[var(--text-secondary)]">{nameOf.get(f.steamId)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {active && (
        <div className="mt-2 rounded-lg bg-[var(--accent-muted)] p-2.5 text-xs">
          <p className="text-[var(--text-secondary)]">{active.detail}</p>
          <p className="mt-1 text-[var(--text-primary)]">
            <span className="font-semibold text-[var(--accent-hover)]">Rada: </span>
            {active.advice}
          </p>
          {hasLineupPractice(active.type) && <PracticeLink findingId={active.id} />}
        </div>
      )}
    </div>
  );
}

function PracticeLink({ findingId }: { findingId: string }) {
  const t = useT();
  return (
    <Link
      href={`/lineups?finding=${encodeURIComponent(findingId)}`}
      className="mt-2 inline-flex min-h-10 items-center gap-1.5 font-medium text-[var(--accent-hover)] hover:underline"
    >
      <Target className="h-3.5 w-3.5" aria-hidden />
      {t("lineups.practiceButton")}
    </Link>
  );
}
