Create a new React component for CS2 Analyst.

## Instructions

1. Read `DESIGN.md` and `.claude/skills/design-system/SKILL.md` for styling rules
2. Use existing UI primitives from `src/components/ui/` (Card, Button, Badge, StatCard)
3. Follow project conventions:
   - Server Components by default, `"use client"` only when needed
   - File naming: `kebab-case.tsx`
   - Named exports (not default)
   - Strict TypeScript — no `any`
   - All numbers use `font-mono` (Geist Mono)
4. Place component in the appropriate directory:
   - `src/components/ui/` — base primitives
   - `src/components/charts/` — data visualization
   - `src/components/maps/` — map/canvas related
   - `src/components/replay/` — replay viewer related
   - `src/components/auth/` — authentication
   - `src/components/layout/` — layout (sidebar, topbar)
5. Use CSS custom properties (`var(--*)`) from the design system
6. Add `transition-all duration-150` on interactive elements
7. Use team colors through tokens only: `var(--ct-blue)` / `var(--t-gold)` (Violet Lime targets CT `#5AA9FF` / T `#FFC23D`, applied in S2)
8. Must work at 360 px wide with no horizontal page scroll (mobile is mandatory)

## Args
$ARGUMENTS — Component name and description
