# CS2 Analyst — Design System (Violet Lime)

> Paleta **Violet Lime (Esport Neon)** wybrana przez właściciela projektu 12.10.2026.
> Tokeny w `src/styles/globals.css` mają wartości Violet Lime od sesji **S2** (`docs/SESSIONS.md`). Komponenty w `src/components/ui/`, nawigacja w `src/components/layout/`.

## 1. Visual Theme & Atmosphere

An **esport neon interface**: near-black violet-tinted surfaces, data glowing out of the dark in two signal colors — **violet** for structure and interaction, **lime** for the one thing that matters most on a screen (the main CTA, the best number, the "do this next" advice). It should feel like a broadcast overlay of a CS2 major, not a generic SaaS dashboard, while staying readable enough for a casual FACEIT player on a phone.

**Key Characteristics:**
- Dark-mode only: `#08070D` page, `#100E19` panel, `#181528` raised panel
- Two accents with distinct jobs: violet `#9B6BFF` (interactive, active, focus), lime `#C6FF3D` (primary CTA, highlights, "best")
- Fonts: **Chakra Petch** (headings, angular esport feel) + **Geist** (body) + **Geist Mono** (every number)
- Game colors with fixed meaning: CT `#5AA9FF`, T `#FFC23D`, mistake `#FF4D6A`, good decision `#3DF5A0`, warning `#FFB020`
- Violet-tinted hairlines `rgba(190,160,255,0.12)` instead of white borders
- Glow is used sparingly: focus rings, the lime CTA, the selected replay player — never on whole cards
- **Mobile first-class:** every screen works from 360 px with no horizontal page scroll

## 2. Color Palette & Roles

Token names match `src/styles/globals.css`. Values are the Violet Lime targets.

### Background Surfaces
| Token | Value | Use |
|---|---|---|
| `--canvas` | `#08070D` | Page background |
| `--surface-1` | `#100E19` | Cards, sidebar, panels |
| `--surface-2` | `#181528` | Raised cards, dropdowns, popovers |
| `--surface-3` | `#211C36` | Hover / selected rows |
| `--surface-4` | `#2A2442` | Inputs, search fields, code blocks |

### Text
| Token | Value | Contrast on `#100E19` | Use |
|---|---|---|---|
| `--text-primary` | `#F3F0FF` | 17:1 | Headlines, key numbers, names |
| `--text-secondary` | `#B9B2D6` | 9.5:1 | Body, descriptions |
| `--text-tertiary` | `#8A83A8` | 5.4:1 | Metadata, timestamps, labels |
| `--text-disabled` | `#4A4560` | — | Disabled, placeholder |

### Accents
| Token | Value | Use |
|---|---|---|
| `--accent` | `#9B6BFF` | Violet: links, active nav, selected tab, focus, secondary-weight buttons |
| `--accent-hover` | `#B08CFF` | Violet hover |
| `--accent-active` | `#8150F0` | Violet pressed |
| `--accent-muted` | `rgba(155,107,255,0.15)` | Selected row / badge background |
| `--accent-glow` | `rgba(155,107,255,0.35)` | Focus ring, glow |
| `--accent-2` (new) | `#C6FF3D` | Lime: the primary CTA of a screen, "best" value, top advice |
| `--accent-2-hover` (new) | `#D6FF73` | Lime hover |
| `--accent-2-muted` (new) | `rgba(198,255,61,0.14)` | Lime badge background |
| `--accent-2-glow` (new) | `rgba(198,255,61,0.35)` | CTA glow |

Text on violet or lime fills is dark `#08070D` (5.7:1 on violet, 17:1 on lime). White on violet is only 3.5:1 — don't.

### Game-Native & Meaning Colors (fixed — never reuse for decoration)
| Token | Value | Meaning |
|---|---|---|
| `--ct-blue` | `#5AA9FF` | Counter-Terrorist |
| `--ct-blue-muted` | `rgba(90,169,255,0.15)` | CT tint |
| `--t-gold` | `#FFC23D` | Terrorist |
| `--t-gold-muted` | `rgba(255,194,61,0.15)` | T tint |
| `--mistake` (new) / `--error` / `--kill-red` | `#FF4D6A` | Detected mistake, loss, kill marker, error |
| `--mistake-muted` / `--error-muted` / `--kill-red-muted` | `rgba(255,77,106,0.15)` | Mistake background |
| `--good` (new) / `--success` | `#3DF5A0` | Good decision, win, positive trend |
| `--good-muted` / `--success-muted` | `rgba(61,245,160,0.15)` | Good background |
| `--warning` | `#FFB020` | Warning, force buy, medium-severity finding |
| `--warning-muted` | `rgba(255,176,32,0.15)` | Warning background |
| `--info` | `#4DE1FF` | Informational badges, utility stats |
| `--info-muted` | `rgba(77,225,255,0.15)` | Info background |
| `--death-gray` | `#6E6890` | Dead / eliminated player |
| `--headshot-gold` | `#C6FF3D` | Headshot indicator (lime = exceptional) |
| `--flash-white` | `#F3F0FF` | Flash-assisted kill |

### Grenade Colors
| Token | Value |
|---|---|
| `--smoke` | `#A9A3C4` |
| `--molotov` | `#FF7A33` |
| `--flash` | `#FFF27A` |
| `--he` | `#FF4D6A` |
| `--decoy` | `#9B6BFF` |

### Borders
| Token | Value |
|---|---|
| `--border` | `rgba(190,160,255,0.12)` |
| `--border-hover` | `rgba(190,160,255,0.22)` |
| `--border-active` | `rgba(155,107,255,0.55)` |
| `--divider` | `rgba(190,160,255,0.06)` |

### Overlay
- **Overlay**: `rgba(4,3,8,0.80)` — modal backdrops
- **Glass**: `rgba(16,14,25,0.80)` + `backdrop-filter: blur(12px)` — floating panels, top bar, mobile bottom nav

### Finding Severity (report, session S10)
| Severity | Color | Tag |
|---|---|---|
| High | `--mistake` | filled `--mistake-muted`, text `--mistake` |
| Medium | `--warning` | filled `--warning-muted`, text `--warning` |
| Low / tip | `--accent` | filled `--accent-muted`, text `--accent` |
| Good play | `--good` | filled `--good-muted`, text `--good` |

Severity is never color-only: every tag also has a text label or icon.

## 3. Typography Rules

### Font Family
- **Display / headings**: `Chakra Petch` (600/700), via `next/font/google`, CSS var `--font-display`
- **Body**: `Geist`, via `geist/font/sans` (already loaded), fallbacks `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **Numbers**: `Geist Mono`, via `geist/font/mono` (already loaded), fallbacks `"SF Mono", "Roboto Mono", monospace`

Chakra Petch must load with `latin-ext` subset (Polish diacritics).

### Hierarchy

| Role | Font | Size (desktop / mobile) | Weight | Line Height | Letter Spacing |
|------|------|------|--------|-------------|----------------|
| Display | Chakra Petch | 56 / 36px | 700 | 1.05 | -0.5px |
| H1 | Chakra Petch | 32 / 26px | 700 | 1.15 | -0.3px |
| H2 | Chakra Petch | 24 / 20px | 600 | 1.25 | 0 |
| H3 | Chakra Petch | 20 / 18px | 600 | 1.30 | 0 |
| H4 | Geist | 16px | 600 | 1.40 | 0 |
| Body | Geist | 14px (15px on mobile) | 400 | 1.60 | 0 |
| Small | Geist | 13px | 400 | 1.50 | 0 |
| Label / overline | Chakra Petch | 12px | 600 | 1.40 | 0.8px, uppercase |
| Stat Number | Geist Mono | 28 / 24px | 700 | 1.10 | -0.5px |
| Stat Small | Geist Mono | 16px | 600 | 1.20 | 0 |
| Mono Body | Geist Mono | 13px | 400 | 1.50 | 0 |

### Principles
- **Every number is Geist Mono** (stats, scores, ticks, money, times, percentages) with `tabular-nums`
- Chakra Petch only for headings and short labels — never for paragraphs or numbers
- Body text never below 13px; on mobile prefer 15px
- Weight ladder: 400 reading → 500 emphasis → 600 headings → 700 display/stats

## 4. Component Stylings

### Buttons
| Variant | Background | Text | Hover | Use |
|---|---|---|---|---|
| **CTA (lime)** | `--accent-2` | `#08070D` | `--accent-2-hover` + `0 0 24px var(--accent-2-glow)` | One per screen: "Wgraj demo", "Analizuj zaznaczone", "Połącz FACEIT" |
| **Primary (violet)** | `--accent` | `#08070D` | `--accent-hover` + `0 0 20px var(--accent-glow)` | Other main actions |
| **Secondary** | `rgba(190,160,255,0.06)` + `1px solid var(--border)` | `--text-secondary` | bg `0.10`, text `--text-primary` | Neutral actions |
| **Ghost** | transparent | `--text-tertiary` | bg `rgba(190,160,255,0.06)`, text `--text-secondary` | Toolbars |
| **Danger** | `--mistake-muted` | `--mistake` | bg `rgba(255,77,106,0.25)` | Delete analysis / unlink |

All: radius `8px`, padding `10px 18px`, font Geist 14px/600, min touch target `44px` high on mobile, `transition 150ms ease-out`, disabled `opacity: 0.4`. Focus-visible: `0 0 0 3px var(--accent-glow)`.

### Cards
- **Standard**: `--surface-1`, `1px solid var(--border)`, radius `12px`, padding `20px` (`16px` on mobile); hover border `--border-hover`
- **Stat card**: standard + `border-top: 2px solid var(--accent)`; number Stat Number, label Label/overline in `--text-tertiary`. The single best stat on a screen may use a lime top border.
- **Match card**: map thumbnail, score, player line. Win `border-left: 3px solid var(--good)`, loss `--mistake`, draw `--text-tertiary`. On mobile stacks vertically.
- **Finding card** (S10): severity tag, title, round + time in mono, one-sentence advice, mini 2D replay, "pro: X" comparison, "Pokaż w replayu" button.

### Inputs
- Background `--surface-4`, border `1px solid var(--border)`, radius `8px`, padding `10px 14px`, text `--text-primary`, placeholder `--text-disabled`
- Focus: border `--accent`, ring `0 0 0 3px var(--accent-glow)`
- Checkbox (match selection, S7): 20px box, checked fill `--accent-2` with dark check

### Tables (Scoreboard)
- Header: `rgba(190,160,255,0.03)` bg, Label/overline style, `--text-tertiary`
- Row divider `--divider`, hover `--surface-3`
- CT row: left border `2px solid var(--ct-blue)` at 60% alpha; T row: `--t-gold` at 60%
- Positive stats `--good`, negative `--mistake`, neutral `--text-secondary`
- **Mobile:** tables scroll horizontally *inside* their card (`overflow-x: auto`) with the player name column sticky; the page itself never scrolls horizontally

### Navigation
- **Sidebar (≥1024px)**: `--surface-1`, width `240px` (collapsible to `64px`), border-right `--border`. Expandable categories (header: category icon, Chakra Petch uppercase label, chevron; active category icon lime; items indented under a 1px `--border` guide line): **Mecze**, **Rozwój**, **Mapa i taktyka**, **Gracze**, **Drużyna**, **Pro i plan**. Open state is remembered; the current screen's category opens by itself; a closed category holding the current screen shows a lime dot. Collapsed (64px) shows every screen icon, categories separated by a line. The mobile drawer uses the same categories. Item padding `8px 12px`, radius `6px`; active `--accent-muted` bg + `--accent` text + 2px violet left bar; icons 18px.
- **Top bar**: glass, height `56px`, sticky, border-bottom `--border`
- **Mobile (<768px)**: bottom bar (glass, `64px` + safe-area inset) with 4–5 main destinations and a "Więcej" drawer for the rest; sidebar hidden

### Badges / Tags
- Pill: radius `9999px`, padding `2px 8px`, Geist 12px/600
- Muted bg + bright text of the role color (win `--good`, loss `--mistake`, CT, T, severity)

### Tooltips
- `--surface-2`, `1px solid var(--border-hover)`, shadow level 2, radius `8px`, padding `8px 12px`, 13px `--text-primary`
- On touch devices tooltips must also open on tap

### Toast / Progress (S2)
- Toast: `--surface-2`, left bar in role color, bottom-center on mobile, bottom-right on desktop
- Progress: track `--surface-4`, fill `--accent` (analysis queue), `--accent-2` when complete

## 5. Layout Principles

### Spacing Scale
`4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64` px

### Grid
- Dashboard: `grid-template-columns: 240px 1fr` from 1024px
- Content max-width `1440px`, padding `0 32px` desktop, `0 16px` mobile
- Card grid: `repeat(auto-fill, minmax(min(320px, 100%), 1fr))`, gap `16px`
- Stat row: 4 columns desktop, 2 tablet, 2 mobile (1 below 360px)

### Responsive Breakpoints
- **Desktop** ≥1280px — full sidebar, 4-column stats
- **Laptop** 1024–1279px — collapsible sidebar
- **Tablet** 768–1023px — no sidebar, top bar with drawer, 2-column stats
- **Mobile** 360–767px — bottom nav, single column, stacked cards
- Test every screen at **360px**; no horizontal page scroll is a hard requirement

## 6. Depth & Elevation

- **Level 1**: `0 1px 3px rgba(0,0,0,0.5)` — cards
- **Level 2**: `0 4px 12px rgba(0,0,0,0.6)` — dropdowns, popovers
- **Level 3**: `0 8px 24px rgba(0,0,0,0.7)` — modals
- **Level 4**: `0 16px 48px rgba(0,0,0,0.75)` — full-screen overlays
- **Glows**: focus `0 0 0 3px var(--accent-glow)`; CTA `0 0 24px var(--accent-2-glow)`; kill flash in replay `0 0 30px rgba(255,77,106,0.45)`

## 7. Map & Replay Specific

### 2D Replay Canvas
- Background `--canvas`; radar image desaturated, ~30% opacity
- Player dots: 12px circles, CT `#5AA9FF` / T `#FFC23D` fill, 1px `#F3F0FF` outline
- Selected player: 14px + pulsing violet glow ring
- FOV cone (S10): team color at 12% alpha, 90° wide
- Death ×: `--mistake`, 16px
- Mistake marker on the timeline (S10): `--mistake` tick; good-play marker `--good`
- Names: Geist Mono 10px, `#F3F0FF` with dark outline
- Grenades: 2px dashed trajectories in grenade colors; smoke radial `rgba(169,163,196,0.3)`, molotov polygon `rgba(255,122,51,0.25)`
- Planted bomb: pulsing `--t-gold`
- Timeline scrubber: fill `--accent` on `--surface-4` track; thumb ≥ 24px on touch
- Controls are touch-friendly (S5): play/pause, speed, round picker usable with a thumb at 360px

### Heatmaps
- Gradient: `transparent → rgba(155,107,255,0.25) → rgba(198,255,61,0.45) → rgba(255,176,32,0.6) → rgba(255,77,106,0.8)`
- Canvas + Gaussian blur; radar grayscale at 50%
- Static — never animated

### Homepage Hero (S3)
- Canvas of neon soldier silhouettes (CT: helmet, backpack, M4; T: balaclava, AK) running map routes with a glowing trail in CT/T colors over a violet grid
- Pauses when the tab is hidden; static frame under `prefers-reduced-motion`

## 8. Do's and Don'ts

### Do
- ✅ Geist Mono for ALL numbers
- ✅ One lime CTA per screen; violet for everything else interactive
- ✅ Keep CT/T/mistake/good colors for their meaning only
- ✅ WCAG AA (4.5:1) for body text; dark text on violet and lime fills
- ✅ 150ms ease-out hovers, 200ms reveals; respect `prefers-reduced-motion`
- ✅ Empty states with a CTA ("Wgraj pierwsze demo")
- ✅ Skeletons shaped like the final layout
- ✅ Check every screen at 360px

### Don't
- ❌ No light theme
- ❌ No hard-coded hex in components — use tokens
- ❌ No white text on violet fills
- ❌ No lime for decoration or large areas — it loses its "look here" meaning
- ❌ No color-only meaning — add text or an icon
- ❌ No body text under 13px
- ❌ No card radius above 12px
- ❌ No animated heatmaps
- ❌ No horizontal page scroll on mobile

## 9. Agent Prompt Guide

### Quick Token Reference
```css
--canvas: #08070D;
--surface-1: #100E19;
--surface-2: #181528;
--surface-3: #211C36;
--surface-4: #2A2442;
--text-primary: #F3F0FF;
--text-secondary: #B9B2D6;
--text-tertiary: #8A83A8;
--accent: #9B6BFF;      /* violet */
--accent-2: #C6FF3D;    /* lime */
--ct-blue: #5AA9FF;
--t-gold: #FFC23D;
--mistake: #FF4D6A;
--good: #3DF5A0;
--warning: #FFB020;
--border: rgba(190,160,255,0.12);
```

### Ready-to-Use Prompts
- "Build a match scoreboard card in the Violet Lime design system: CT/T row accents, Geist Mono stats (K/D/A, ADR, HLTV rating), horizontal scroll inside the card at 360px with a sticky name column."
- "Create a finding card for the 'co poprawić' report: severity tag, round and time in mono, one-sentence advice, mini 2D replay and a 'pro: X' comparison."
- "Design a mobile bottom navigation with 4 destinations and a 'Więcej' drawer, glass background, violet active state."
