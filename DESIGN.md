# CS2 Analyst — Design System

## 1. Visual Theme & Atmosphere

A **tactical dark interface** where data emerges from deep darkness like a briefing room monitor. The design philosophy is "military-grade precision meets esports energy" — near-black surfaces with surgical information hierarchy, punctuated by electric accent colors that evoke the competitive tension of a CS2 match.

Dark-mode-native. Not a dark theme applied to a light design — darkness is the canvas. Information density is managed through luminance gradations and spatial hierarchy. The UI should feel like a high-end analytics dashboard built for professional esports coaches, yet intuitive enough for a casual player checking their match stats.

**Key Characteristics:**
- Dark-mode-native: `#09090b` page background, `#0f0f12` panel/card background, `#16161a` elevated surfaces
- Font system: **Geist** (primary sans) + **Geist Mono** (code/stats/numbers) — sharp, modern, technical
- Brand accent: Electric Blue `#3b82f6` — the HUD overlay color, evokes targeting crosshair
- CT Side: `#60a5fa` (blue), T Side: `#fbbf24` (amber/gold) — native CS2 team colors integrated into the design
- Kill color: `#ef4444` (red), Death: `#6b7280` (muted gray), Headshot: `#f59e0b` (gold)
- Ultra-thin borders: `rgba(255,255,255,0.06)` — structure without visual noise
- Glassmorphism-lite: subtle `backdrop-blur` on overlays and floating panels
- Data-first: numbers, charts, and heatmaps are the heroes — decoration is minimal

## 2. Color Palette & Roles

### Background Surfaces
- **Canvas** (`#09090b`): Deepest background. The void behind everything.
- **Surface 1** (`#0f0f12`): Card backgrounds, sidebar, main content panels.
- **Surface 2** (`#16161a`): Elevated cards, dropdowns, popovers.
- **Surface 3** (`#1c1c22`): Active/selected states, hover backgrounds.
- **Surface 4** (`#24242e`): Inputs, search fields, code blocks.

### Text & Content
- **Text Primary** (`#fafafa`): Headlines, key numbers, player names.
- **Text Secondary** (`#a1a1aa`): Body text, descriptions, labels.
- **Text Tertiary** (`#71717a`): Metadata, timestamps, de-emphasized content.
- **Text Disabled** (`#3f3f46`): Disabled states, placeholder text.

### Brand & Accent
- **Primary** (`#3b82f6`): CTAs, links, active navigation, selected states.
- **Primary Hover** (`#60a5fa`): Hover states on primary elements.
- **Primary Muted** (`rgba(59,130,246,0.15)`): Selected row backgrounds, badge backgrounds.
- **Primary Glow** (`rgba(59,130,246,0.25)`): Subtle glow effects on focused elements.

### Game-Native Colors
- **CT Blue** (`#60a5fa`): Counter-Terrorist team color. Used in team-specific stats, replay player markers.
- **CT Blue Muted** (`rgba(96,165,250,0.15)`): CT background tints.
- **T Gold** (`#fbbf24`): Terrorist team color. Amber/gold.
- **T Gold Muted** (`rgba(251,191,36,0.15)`): T background tints.
- **Kill Red** (`#ef4444`): Kill events, damage indicators, negative stats.
- **Kill Red Muted** (`rgba(239,68,68,0.15)`): Kill event backgrounds.
- **Death Gray** (`#6b7280`): Death events, eliminated players.
- **Headshot Gold** (`#f59e0b`): Headshot indicators, exceptional stats.
- **Flash White** (`#e2e8f0`): Flash-assisted kills, flash indicators.

### Status Colors
- **Success** (`#22c55e`): Win indicators, positive trends, round wins.
- **Success Muted** (`rgba(34,197,94,0.15)`): Success backgrounds.
- **Warning** (`#f59e0b`): Force buys, low economy alerts.
- **Error** (`#ef4444`): Losses, errors, critical alerts.
- **Info** (`#06b6d4`): Informational badges, utility stats.

### Grenade-Specific Colors
- **Smoke** (`#94a3b8`): Smoke grenade trajectories and areas.
- **Molotov** (`#f97316`): Molotov/incendiary spread areas.
- **Flash** (`#fde047`): Flashbang trajectories and effect radius.
- **HE** (`#ef4444`): HE grenade trajectories and damage radius.
- **Decoy** (`#a78bfa`): Decoy trajectories.

### Border & Divider
- **Border Default** (`rgba(255,255,255,0.06)`): Default card/container borders.
- **Border Hover** (`rgba(255,255,255,0.10)`): Hover-state borders.
- **Border Active** (`rgba(59,130,246,0.40)`): Active/focused input borders.
- **Divider** (`rgba(255,255,255,0.04)`): Table row dividers, section separators.

### Overlay
- **Overlay** (`rgba(0,0,0,0.80)`): Modal/dialog backdrops.
- **Glass** (`rgba(15,15,18,0.80)` + `backdrop-filter: blur(12px)`): Floating panels, tooltips.

## 3. Typography Rules

### Font Family
- **Primary**: `Geist`, fallbacks: `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`
- **Mono**: `Geist Mono`, fallbacks: `"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace`
- **Loading**: Use `next/font/google` or `next/font/local` for optimal loading

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Usage |
|------|------|------|--------|-------------|----------------|-------|
| Display | Geist | 48px | 700 | 1.05 | -1.2px | Hero headlines, page titles |
| H1 | Geist | 32px | 700 | 1.15 | -0.8px | Section headers |
| H2 | Geist | 24px | 600 | 1.25 | -0.5px | Card headers, subsections |
| H3 | Geist | 20px | 600 | 1.30 | -0.3px | Widget titles |
| H4 | Geist | 16px | 600 | 1.40 | -0.1px | Small section headers |
| Body | Geist | 14px | 400 | 1.60 | 0 | Default reading text |
| Body Medium | Geist | 14px | 500 | 1.60 | 0 | Emphasis in body text |
| Small | Geist | 13px | 400 | 1.50 | 0 | Secondary text, metadata |
| Caption | Geist | 12px | 500 | 1.40 | 0.2px | Labels, badges, overlines |
| Tiny | Geist | 11px | 400 | 1.35 | 0.3px | Timestamps, micro-labels |
| Stat Number | Geist Mono | 28px | 700 | 1.10 | -0.5px | Key statistics (K/D, ADR) |
| Stat Small | Geist Mono | 16px | 600 | 1.20 | 0 | Inline stats, scores |
| Mono Body | Geist Mono | 13px | 400 | 1.50 | 0 | Code, tick numbers, SteamIDs |

### Principles
- **Numbers are always Geist Mono**: Stats, scores, tick counts, economy values — always monospace for readability and alignment
- **Tight headlines**: Negative letter-spacing at display/H1 sizes for compressed, authoritative feel
- **Readable body**: 14px base with generous line-height for dashboard content
- **Weight ladder**: 400 (reading) → 500 (emphasis) → 600 (headings) → 700 (display/stats)

## 4. Component Stylings

### Buttons

**Primary Button**
- Background: `#3b82f6`
- Text: `#ffffff`
- Padding: `10px 20px`
- Border-radius: `8px`
- Font: 14px / 500
- Hover: `#60a5fa`, `box-shadow: 0 0 20px rgba(59,130,246,0.3)`
- Active: `#2563eb`
- Disabled: `opacity: 0.4; cursor: not-allowed`

**Secondary Button**
- Background: `rgba(255,255,255,0.06)`
- Text: `#a1a1aa`
- Border: `1px solid rgba(255,255,255,0.08)`
- Hover: `background: rgba(255,255,255,0.10); color: #fafafa`
- Radius: `8px`

**Ghost Button**
- Background: `transparent`
- Text: `#71717a`
- Hover: `background: rgba(255,255,255,0.04); color: #a1a1aa`

**Danger Button**
- Background: `rgba(239,68,68,0.15)`
- Text: `#ef4444`
- Hover: `background: rgba(239,68,68,0.25)`

### Cards

**Standard Card**
- Background: `#0f0f12`
- Border: `1px solid rgba(255,255,255,0.06)`
- Radius: `12px`
- Padding: `20px`
- Hover: `border-color: rgba(255,255,255,0.10)`

**Stat Card**
- Same as Standard + top accent border: `border-top: 2px solid #3b82f6`
- Number: Geist Mono 28px/700, `#fafafa`
- Label: Geist 12px/500, `#71717a`, uppercase, letter-spacing 0.5px

**Match Card**
- Horizontal layout, map thumbnail left, score center, player stats right
- Win state: left border `3px solid #22c55e`
- Loss state: left border `3px solid #ef4444`
- Draw state: left border `3px solid #71717a`

### Inputs

**Text Input**
- Background: `#16161a`
- Border: `1px solid rgba(255,255,255,0.08)`
- Radius: `8px`
- Padding: `10px 14px`
- Text: `#fafafa`
- Placeholder: `#3f3f46`
- Focus: `border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15)`

### Tables (Scoreboard)

- Header: `background: rgba(255,255,255,0.02)`, text `#71717a`, font 12px/500, uppercase
- Row: `border-bottom: 1px solid rgba(255,255,255,0.04)`
- Row Hover: `background: rgba(255,255,255,0.03)`
- CT Row Accent: left border `2px solid rgba(96,165,250,0.5)`
- T Row Accent: left border `2px solid rgba(251,191,36,0.5)`
- Numbers in cells: Geist Mono
- Positive stats: `#22c55e`, Negative: `#ef4444`, Neutral: `#a1a1aa`

### Navigation

**Sidebar**
- Background: `#0f0f12`
- Width: `240px` (collapsible to `64px`)
- Border-right: `1px solid rgba(255,255,255,0.06)`
- Nav item: padding `8px 12px`, radius `6px`
- Active: `background: rgba(59,130,246,0.15); color: #60a5fa`
- Hover: `background: rgba(255,255,255,0.04)`
- Icons: 18px, `#71717a` default, `#60a5fa` active

**Top Bar**
- Background: `rgba(9,9,11,0.80)` + `backdrop-filter: blur(12px)`
- Border-bottom: `1px solid rgba(255,255,255,0.06)`
- Height: `56px`
- Position: `sticky; top: 0; z-index: 50`

### Badges / Pills

- Background: role-specific muted color
- Text: role-specific bright color
- Padding: `2px 8px`
- Radius: `9999px` (pill)
- Font: 12px/500
- Examples: Win (`bg: #22c55e/15%, text: #22c55e`), Loss (`bg: #ef4444/15%, text: #ef4444`)

### Tooltips

- Background: `#1c1c22`
- Border: `1px solid rgba(255,255,255,0.08)`
- Shadow: `0 4px 12px rgba(0,0,0,0.5)`
- Radius: `8px`
- Padding: `8px 12px`
- Text: `#fafafa`, 13px
- Arrow: matching background

## 5. Layout Principles

### Spacing Scale
- `4px` — micro gaps (inline icon margins)
- `8px` — tight gaps (between related elements)
- `12px` — standard gap (form field spacing)
- `16px` — comfortable gap (card internal padding small)
- `20px` — card padding default
- `24px` — section gaps
- `32px` — major section separators
- `48px` — page-level vertical spacing
- `64px` — hero/feature spacing

### Grid
- **Dashboard**: CSS Grid, `grid-template-columns: 240px 1fr` (sidebar + content)
- **Content area**: Max-width `1440px`, padding `0 32px`
- **Card grid**: `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`, gap `16px`
- **Stat row**: `grid-template-columns: repeat(4, 1fr)`, gap `16px`

### Responsive Breakpoints
- **Desktop**: ≥1280px — full sidebar, 4-column stats
- **Tablet**: 768px–1279px — collapsed sidebar (icons only), 2-column stats
- **Mobile**: <768px — bottom nav, 1-column, stacked cards

## 6. Depth & Elevation

### Shadow System (dark surfaces)
- **Level 0** (flush): No shadow — inline elements
- **Level 1** (subtle): `0 1px 3px rgba(0,0,0,0.4)` — cards
- **Level 2** (raised): `0 4px 12px rgba(0,0,0,0.5)` — dropdowns, popovers
- **Level 3** (floating): `0 8px 24px rgba(0,0,0,0.6)` — modals, dialogs
- **Level 4** (overlay): `0 16px 48px rgba(0,0,0,0.7)` — full-screen overlays

### Glow Effects (accent)
- **Focus glow**: `0 0 0 3px rgba(59,130,246,0.15)` — input focus rings
- **Button glow**: `0 0 20px rgba(59,130,246,0.3)` — primary button hover
- **Kill flash**: Momentary `0 0 30px rgba(239,68,68,0.4)` on kill events in replay

## 7. Map & Replay Specific

### 2D Replay Canvas
- Background: Map radar image, desaturated to ~30% opacity
- Player dots: 12px circles with team color fill + 1px white outline
- Selected player: 14px circle + pulsing glow ring
- Death X: `×` marker in `#ef4444`, 16px
- Player name labels: Geist Mono 10px, white with black outline for readability
- Grenade trajectories: 2px dashed lines in grenade-type color
- Smoke clouds: Circular gradient, `rgba(148,163,184,0.3)`, animated fade
- Molotov: Irregular polygon, `rgba(249,115,22,0.25)`, animated flicker
- Bomb icon: Pulsing marker, `#fbbf24`, when planted
- Timeline scrubber: Bottom bar, `#3b82f6` progress fill on `#16161a` track

### Heatmaps
- Color gradient: `transparent → rgba(59,130,246,0.2) → rgba(34,197,94,0.4) → rgba(251,191,36,0.6) → rgba(239,68,68,0.8)`
- Render on Canvas with Gaussian blur
- Map background: grayscale radar, 50% opacity

## 8. Do's and Don'ts

### Do's
- ✅ Use Geist Mono for ALL numbers and statistics
- ✅ Maintain consistent border-radius (8px cards, 6px buttons/inputs, 9999px badges)
- ✅ Use team colors (CT blue / T gold) consistently across all team-related data
- ✅ Keep contrast ratios WCAG AA compliant (4.5:1 for body text)
- ✅ Animate state transitions: 150ms ease-out for hovers, 200ms for reveals
- ✅ Use empty states with helpful CTAs ("Upload your first demo to get started")
- ✅ Show loading skeletons that match the final layout shape

### Don'ts
- ❌ Never use pure white (`#ffffff`) for backgrounds — max is `#fafafa` for text
- ❌ Never use color alone to convey meaning — combine with icons/text
- ❌ Don't overuse the brand blue — it's for primary actions and active states only
- ❌ Don't put body text below 13px
- ❌ Don't use light/white mode as default — this is a dark-mode-native app
- ❌ Don't use rounded corners above 12px on cards (keep it sharp, tactical)
- ❌ Don't animate heatmaps — they should feel like static analytical overlays

## 9. Agent Prompt Guide

### Quick Color Reference
```css
--canvas: #09090b;
--surface-1: #0f0f12;
--surface-2: #16161a;
--surface-3: #1c1c22;
--text-primary: #fafafa;
--text-secondary: #a1a1aa;
--text-tertiary: #71717a;
--accent: #3b82f6;
--accent-hover: #60a5fa;
--ct-blue: #60a5fa;
--t-gold: #fbbf24;
--kill-red: #ef4444;
--success: #22c55e;
--warning: #f59e0b;
--border: rgba(255,255,255,0.06);
```

### Ready-to-Use Prompts
- "Build a match scoreboard card using the CS2 Analyst design system. Use CT blue and T gold for team rows, Geist Mono for all stats, and include K/D/A, ADR, and HLTV rating columns."
- "Create a player stat dashboard with 4 stat cards at top (KD ratio, ADR, HS%, Win Rate), a match history list below, and an aim rating chart on the right."
- "Design a 2D replay timeline scrubber with play/pause controls, speed selector, round markers, and kill event indicators."
- "Build a grenade analysis overlay showing smoke positions on the map with trajectory lines and a sidebar listing all utility thrown per round."
