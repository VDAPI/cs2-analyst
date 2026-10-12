---
name: replay-canvas
description: Canvas rendering patterns for the 2D replay viewer and heatmap visualizations. Covers coordinate transforms, player rendering, heatmap KDE, and playback architecture. Use when building or modifying any canvas-based feature.
---

# Canvas Rendering — Replay, Heatmaps, Grenades

> **Roadmap (`docs/SESSIONS.md`):** S5 moved all tool canvases to Violet Lime, shared helpers and touch controls (360 px). Since S6 tick data comes from the DB (`RoundTicks`, every 4 ticks); the store's fetch contract (`/api/matches/[matchId]/ticks`) stayed the same. S10 adds FOV cones, utility timers, mistake markers on the timeline and jump-to-moment; S16 adds map notes and shareable moment links.

## Shared building blocks (S5) — reuse, don't copy

| What | Where |
| --- | --- |
| Canvas colors mirroring the tokens (`CANVAS_COLORS`, `GRENADE_STYLE`, `healthColor`) | `src/lib/canvas/palette.ts` |
| `makeWorldToCanvas`, `drawRadarBackground`, `drawEmptyHint`, `TOOL_CANVAS_SIZE`, `RadarConfig` | `src/lib/canvas/radar.ts` |
| Heatmap KDE layer + legend gradient | `src/lib/canvas/heatmap-layer.ts` |
| Replay drawing (players, kills, smokes, fires, HE, flash, trajectories, bomb + `activeBomb`) | `src/lib/canvas/replay-draw.ts` |
| `MapViewport`: square canvas with pinch / Ctrl+wheel zoom, drag pan, double-tap reset, +/− buttons, `onTap` in canvas coords, overlays as children | `src/components/maps/map-viewport.tsx` |
| `useRadarImage(src)`, `useCanvasUiScale(canvasRef, zoom)` | `src/components/maps/use-canvas.ts` |
| One heatmap screen for a match or a whole map (`source.kind`) | `src/components/maps/heatmap-explorer.tsx` |
| `ToolHeader`, `Segmented`, `ControlGroup`, `ToggleRow`, `ToolSelect`, tool match pickers | `src/components/tools/` |

Rules:
- Canvas 2D and SVG attributes can't read CSS vars: use `CANVAS_COLORS` / `GRENADE_STYLE.line`; DOM uses `var(--token)` (`GRENADE_STYLE.token`).
- Markers and labels are multiplied by `ui = useCanvasUiScale(canvasRef, zoom)` so they keep a readable on-screen size on phones and don't balloon when zoomed. Game-world sizes (smoke radius) are not scaled.
- Tap targets on the canvas: pick the nearest object within `radius * ui` from `MapViewport`'s `onTap`.
- At 1× the viewport keeps `touch-action: pan-y` so the page still scrolls over the map; zoomed it is `none`.
- No full-map flash under `prefers-reduced-motion`; heatmaps are never animated.

## Replay viewer (`/replay/[matchId]`)
- **State**: Zustand store `src/stores/replay-store.ts` — `loadRound`, `nextFrame`, `seekSeconds(±s)`, `selectPlayer(id)` (toggle), `togglePlay` (restarts at round end), `TICK_RATE`.
- **Data**: per round from the DB; the viewer requests `interval=32` (~2 frames/s of game time).
- **Loop**: `requestAnimationFrame`, ms per frame from the frame tick spacing and speed (0.5×–4×); pauses when the tab is hidden.
- **Controls** (`playback-controls.tsx`): scrubber with kill (mistake) and bomb (T gold) marks you can tap, ±5 s, prev/next round, 56px play, speed `Segmented`, layer toggles, scrollable round strip (bottom border = round winner, half-time divider).
- **Keys**: Space play/pause, ←/→ 5 s, Shift+←/→ round, Esc clears selection.
- **Deep link**: `?round=N&tick=T` starts 2 s before T (used by mechanics, grenades, economy).

### Layer order (back to front)
1. `--canvas` fill + radar (grayscale, 30%) or grid fallback
2. Smokes, fires, grenade trajectories
3. Kill × markers (mistake; glow for 2 s after the kill)
4. Planted bomb (pulsing T gold, site letter) + timer bar on the bottom edge
5. HE blasts
6. Players: view line, team-color body with light outline, health bar, name; selected player last with a pulsing violet ring
7. Flash pop (full-map white only without reduced motion)

## Coordinate transform

```typescript
const worldToCanvas = makeWorldToCanvas(mapConfig); // memoize per mapConfig
// x = (gameX - posX) / scale * (1024 / width);  y = (posY - gameY) / scale * (1024 / height)
```
Y is inverted (posY - gameY). Map configs: `src/lib/utils/maps.ts`. Unknown maps fall back to Mirage's numbers.

## Heatmap rendering (Gaussian KDE)
1. White radial gradients per point (radius 35) on an offscreen canvas
2. Alpha → intensity `min(alpha / 180, 1)`
3. Colorize with `HEATMAP_STOPS`: transparent → violet 0.25 → lime 0.45 → warning 0.6 → mistake 0.8
4. Draw with `blur(6px)`; radar grayscale at 50%
5. Dots: kills mistake, deaths `deathGray`, headshot ring lime (`--headshot-gold`)

## Grenades (`/grenades/[matchId]`)
- Side filter uses the thrower's side **in that round** (`playerSideAtRound`), not `MatchPlayer.team`.
- Tap a landing spot or a list row to select; the selected grenade links to the replay at its tick.
