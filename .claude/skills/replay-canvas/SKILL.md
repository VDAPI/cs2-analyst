---
name: replay-canvas
description: Canvas rendering patterns for the 2D replay viewer and heatmap visualizations. Covers coordinate transforms, player rendering, heatmap KDE, and playback architecture. Use when building or modifying any canvas-based feature.
---

# Canvas Rendering — Replay & Heatmaps

## Architecture

### Replay Viewer (`/replay/[matchId]`)
- **State**: Zustand store (`src/stores/replay-store.ts`)
  - Frames: `TickFrame[]` (each frame has `tick` + `PlayerSnapshot[]`)
  - `loadRound(matchId, round)`: fetches from `/api/matches/[matchId]/ticks`
  - `nextFrame()`: advances playback, stops at end
- **Data**: Tick data loaded on-demand per round (~190ms parse, ~110 frames/round)
- **Render loop**: `requestAnimationFrame` driven by playback speed (0.5x–4x)

### Heatmap Viewer (`/heatmaps/[matchId]` and `/heatmaps/map/[mapName]`)
- Single-match: fetches from `/api/matches/[matchId]/heatmap`
- Cross-match: fetches from `/api/heatmap?map=...&matches=...`
- Static render — no animation, re-renders on filter change

## Coordinate Transform

```typescript
// Game world → canvas pixel
function worldToCanvas(gameX: number, gameY: number): { x: number; y: number } {
  return {
    x: ((gameX - mapConfig.posX) / mapConfig.scale) * (CANVAS_SIZE / mapConfig.width),
    y: ((mapConfig.posY - gameY) / mapConfig.scale) * (CANVAS_SIZE / mapConfig.height),
  };
}
```

- `CANVAS_SIZE = 1024` (matches radar image dimensions)
- Map configs: `src/lib/utils/maps.ts` — posX, posY, scale per map
- Note: Y-axis is inverted (posY - gameY, not gameY - posY)

## Replay Rendering

### Layer Order (back to front)
1. Background fill (`#0a0a12`)
2. Radar image (30% opacity, grayscale)
3. Dead player X markers (faded)
4. Kill X markers (red, at victim positions)
5. Alive player circles (12px, team color + white outline)
6. Direction indicators (line from center, yaw angle)
7. Health bars (below players)
8. Player name labels (Geist Mono, white with black outline)

### Player Rendering
```typescript
// Alive player
ctx.beginPath();
ctx.arc(x, y, 12, 0, Math.PI * 2);
ctx.fillStyle = team === "CT" ? "#60a5fa" : "#fbbf24";
ctx.fill();
ctx.strokeStyle = "white";
ctx.lineWidth = 1;
ctx.stroke();

// Direction indicator
const rad = (yaw * Math.PI) / 180;
ctx.beginPath();
ctx.moveTo(x, y);
ctx.lineTo(x + Math.cos(rad) * 18, y - Math.sin(rad) * 18);
ctx.strokeStyle = "rgba(255,255,255,0.5)";
ctx.lineWidth = 1.5;
ctx.stroke();
```

### Health Bar
- Width: 20px, centered below player
- Height: 3px
- Background: `rgba(0,0,0,0.5)`
- Fill: team color, width proportional to HP (0–100)

## Heatmap Rendering (Gaussian KDE)

### Process
1. Create offscreen canvas (`OffscreenCanvas`)
2. Draw white radial gradients at each point (radius=35px)
   - Center: `rgba(255,255,255,0.4)`
   - Edge: transparent
3. Read pixel data — alpha channel = intensity
4. Colorize: map intensity (0–1) to DESIGN.md gradient
5. Apply `blur(6px)` filter when drawing to main canvas

### Color Interpolation
```
Stops: 0.00 → blue (59,130,246) α=0
       0.25 → blue (59,130,246) α=0.2
       0.50 → green (34,197,94) α=0.4
       0.75 → gold (251,191,36) α=0.6
       1.00 → red (239,68,68)   α=0.8
```

Normalize intensity: `Math.min(alpha / 180, 1)`

### Dot Overlay (optional)
- Kill dots: `rgba(239,68,68,0.7)`, radius 3.5px (headshot: 5px + gold stroke)
- Death dots: `rgba(107,114,128,0.7)`

## File Locations
- Replay viewer: `src/app/(dashboard)/replay/[matchId]/replay-viewer.tsx`
- Playback controls: `src/app/(dashboard)/replay/[matchId]/playback-controls.tsx`
- Replay store: `src/stores/replay-store.ts`
- Single-match heatmap: `src/app/(dashboard)/heatmaps/[matchId]/heatmap-viewer.tsx`
- Cross-match heatmap: `src/app/(dashboard)/heatmaps/map/[mapName]/cross-match-viewer.tsx`
- Map configs: `src/lib/utils/maps.ts`
