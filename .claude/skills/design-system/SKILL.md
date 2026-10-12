---
name: design-system
description: CS2 Analyst design system quick reference (Violet Lime / Esport Neon) — colors, typography, component patterns, mobile rules and do/don't rules. Use when building or styling any UI component. Full spec in DESIGN.md.
---

# Design System — Quick Reference (Violet Lime)

Full spec: `DESIGN.md` (root). This skill extracts the most-used patterns.

**Migration status:** `src/styles/globals.css` still holds the old blue palette until session S2 (`docs/SESSIONS.md`). Always style through the token names below (`var(--accent)`, `var(--ct-blue)` …), never hard-coded hex, so the S2 value swap recolors everything. Tokens marked *new* do not exist in `globals.css` yet — S2 adds them; before S2, don't reference them.

## Core Tokens (target values)

```css
--canvas: #08070D;          /* Page background */
--surface-1: #100E19;       /* Cards, sidebar */
--surface-2: #181528;       /* Raised cards, dropdowns */
--surface-3: #211C36;       /* Hover / selected */
--surface-4: #2A2442;       /* Inputs */
--text-primary: #F3F0FF;    /* Headlines, key numbers */
--text-secondary: #B9B2D6;  /* Body */
--text-tertiary: #8A83A8;   /* Metadata, labels */
--text-disabled: #4A4560;
--accent: #9B6BFF;          /* Violet: links, active nav, focus */
--accent-2: #C6FF3D;        /* new — Lime: the one CTA per screen, "best" */
--ct-blue: #5AA9FF;         /* CT */
--t-gold: #FFC23D;          /* T */
--mistake: #FF4D6A;         /* new — detected mistake (= --error / --kill-red value) */
--good: #3DF5A0;            /* new — good decision (= --success value) */
--warning: #FFB020;
--border: rgba(190,160,255,0.12);
```

Fixed meanings — never use CT, T, mistake, good or warning colors for decoration.

## Typography

- **Headings & short labels**: Chakra Petch 600/700 (added in S2 via `next/font/google`, `latin-ext` subset for Polish)
- **Body**: Geist 14px/400/1.6 (15px on mobile)
- **All numbers/stats**: Geist Mono + `tabular-nums` — K/D, ADR, scores, money, ticks, times, %
- **Labels**: Chakra Petch 12px/600, uppercase, 0.8px tracking
- **Min text size**: 13px

## Component Patterns

### Buttons
- CTA (lime, one per screen): `bg-[var(--accent-2)] text-[#08070D]` + lime glow on hover
- Primary (violet): `bg-[var(--accent)] text-[#08070D]` — never white text on violet (3.5:1)
- Secondary: `border border-[var(--border)] bg-[rgba(190,160,255,0.06)] text-[var(--text-secondary)]`
- Ghost: `text-[var(--text-tertiary)]`, hover bg `rgba(190,160,255,0.06)`
- Danger: `bg-[var(--error-muted)] text-[var(--error)]`
- All: `rounded-lg transition-all duration-150`, min height 44px on touch

### Cards
- `rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 sm:p-5`
- Hover: `hover:border-[var(--border-hover)]`
- Stat card: `border-t-2` violet; the single best stat may be lime

### Badges / Tags
- `rounded-full px-2 py-0.5 text-xs font-semibold`, muted bg + bright text of the role color
- Finding severity: high = mistake, medium = warning, tip = violet, good = good. Always with a text label.

### Tables (Scoreboards)
- Header `rgba(190,160,255,0.03)`, uppercase label style
- Rows divided by `--divider`; CT/T left border 2px
- Mobile: `overflow-x-auto` inside the card, sticky name column

## Mobile (mandatory)

- Every screen works at **360px** with no horizontal page scroll
- `<768px`: bottom nav (glass, safe-area inset) + "Więcej" drawer; no sidebar
- Grids: `grid-cols-2` stats on mobile, `minmax(min(320px,100%),1fr)` card grids
- Tooltips must also open on tap; touch targets ≥ 44px

## Map & Canvas Rendering

### Replay Canvas
- Radar 30% opacity, grayscale; background `--canvas`
- Players: 12px circles, CT `#5AA9FF` / T `#FFC23D` (read from the token at runtime with `getComputedStyle` rather than hard-coding)
- Selected player: violet glow ring; dead: faded ×; kills: mistake-red ×
- Names: Geist Mono 10px, light with dark outline

### Heatmaps
- Gradient: `transparent → violet(0.25) → lime(0.45) → warning(0.6) → mistake(0.8)`
- Gaussian KDE + blur(6px); static, never animated

## Key Rules
- Dark-mode only
- Tokens, not hex
- One lime CTA per screen
- Team and meaning colors are sacred
- Glass: `rgba(16,14,25,0.80) + backdrop-blur(12px)` for top bar, bottom nav, floating panels
- Respect `prefers-reduced-motion`
