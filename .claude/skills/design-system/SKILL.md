---
name: design-system
description: CS2 Analyst design system quick reference — colors, typography, component patterns, and do/don't rules. Use when building or styling any UI component. Full spec in DESIGN.md.
---

# Design System — Quick Reference

Full spec: `DESIGN.md` (root). This skill extracts the most-used patterns.

## Core Colors (CSS Custom Properties)

```css
--canvas: #09090b;          /* Page background */
--surface-1: #0f0f12;       /* Cards, sidebar */
--surface-2: #16161a;       /* Elevated cards, dropdowns */
--surface-3: #1c1c22;       /* Active/selected states */
--text-primary: #fafafa;    /* Headlines, key numbers */
--text-secondary: #a1a1aa;  /* Body text, descriptions */
--text-tertiary: #71717a;   /* Metadata, timestamps */
--text-disabled: #3f3f46;   /* Disabled, placeholder */
--accent: #3b82f6;          /* CTAs, links, active nav */
--accent-hover: #60a5fa;    /* Hover on accent */
--ct-blue: #60a5fa;         /* Counter-Terrorist team */
--t-gold: #fbbf24;          /* Terrorist team */
--error: #ef4444;           /* Kills, losses, errors */
--success: #22c55e;         /* Wins, positive */
--warning: #f59e0b;         /* Headshots, force buys */
--border: rgba(255,255,255,0.06);
```

## Typography Rules

- **All numbers/stats**: Geist Mono (always — K/D, ADR, scores, economy, ticks)
- **Headlines**: Geist, negative letter-spacing (-0.8px at H1, -1.2px at display)
- **Body**: 14px / 400 weight / 1.6 line-height
- **Labels**: 12px / 500 / uppercase / 0.2px letter-spacing
- **Min text size**: 13px (never smaller for body text)

## Component Patterns

### Cards
- `rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5`
- Hover: `hover:border-[var(--border-hover)]`
- Stat card: add `border-t-2` with accent color

### Buttons
- Primary: `bg-[var(--accent)] text-white` → hover glow
- Secondary: `border bg-[rgba(255,255,255,0.06)]`
- Ghost: `text-[var(--text-tertiary)]` → hover bg 0.04
- All: `rounded-lg transition-all duration-150`

### Badges/Pills
- `rounded-full px-2 py-0.5 text-xs font-medium`
- Team: `bg-[var(--ct-blue-muted)] text-[var(--ct-blue)]` / `bg-[var(--t-gold-muted)] text-[var(--t-gold)]`

### Tables (Scoreboards)
- Header: `rgba(255,255,255,0.02)` bg, uppercase 12px
- Rows: `border-bottom: rgba(255,255,255,0.04)`
- Team accent: left border 2px (CT blue / T gold)

## Map & Canvas Rendering

### Replay Canvas
- Radar background: 30% opacity, grayscale
- Player dots: 12px circles, team color fill + 1px white outline
- Dead players: faded X markers
- Kill markers: red X at victim position
- Names: Geist Mono 10px, white with black text outline

### Heatmaps
- Radar background: 50% opacity, grayscale
- Gradient: `transparent → blue(0.2) → green(0.4) → gold(0.6) → red(0.8)`
- Gaussian KDE with blur(6px) post-process
- Static overlays — never animated

## Key Rules
- Dark-mode native — no light theme
- `transition-all duration-150` on all interactive elements
- Never use pure white backgrounds
- Team colors (CT blue / T gold) are sacred — always consistent
- Glass effect: `rgba(15,15,18,0.80) + backdrop-blur(12px)` for floating panels
