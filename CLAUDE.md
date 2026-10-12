# CS2 Analyst

CS2 demo analysis SaaS for FACEIT (and any other) players. Users upload .dem files or pick matches from their FACEIT history and get analytics: player stats, heatmaps, 2D replay, economy tracking, grenade analysis, clutches/trades/multi-kills. The goal is a coach-grade report of mechanical and tactical mistakes compared against pro play.

**Roadmap:** `docs/SESSIONS.md` is the session-by-session plan (S1–S18) and the full feature list with status. Start a session with `Zrób sesję S<n> z docs/SESSIONS.md`. Each session = one branch, one PR. The project owner writes Polish.

## Product Decisions (apply to every change)

- **Never remove existing features.** All current screens stay (matches, players, compare, heatmaps, grenades, economy, 2D replay, clutches, trades, multi-kills, FACEIT, Steam, upload). Redesign and add, don't delete.
- **Palette: Violet Lime (Esport Neon)** — see Design System below and `DESIGN.md`.
- **Mobile is mandatory.** Every screen works from 360 px wide with no horizontal page scroll.
- **Demos:** any demo can be uploaded (FACEIT, Premier, other). FACEIT demos are fetched via the Downloads API only on the player's request (selected matches), never automatically in the background.
- **Delete the .dem after analysis.** The DB keeps the report and sampled replay data; a match can be flagged "keep demo". Replay data is already stored in the DB (S6, see Key Architectural Decisions); deleting demos for every source plus the "keep demo" flag comes in S7.
- **Analysis is as detailed as possible**, mechanics and tactics. Every detected mistake has a moment in the round, a 2D preview, one piece of advice and a pro comparison.
- **Judge advice by what the player could know** (sound, visibility, team info), not by the all-seeing top-down demo view.
- **Business model:** free with a match limit; payments later.

## Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack) + React 19 + TypeScript
- **Styling**: Tailwind CSS 4 + Radix UI primitives
- **State**: Zustand (replay store) on the client; data is fetched from Route Handlers under `src/app/api/` with plain `fetch` or read directly in Server Components via Prisma. tRPC / React Query are installed but not used.
- **Database**: PostgreSQL + Prisma ORM
- **Cache/Queue**: Redis + BullMQ
- **Demo Parser**: @laihoe/demoparser2 (Rust/Node.js native bindings)
- **Auth**: NextAuth.js — email + password (Credentials provider, bcrypt) is the primary login; Steam (`next-auth-steam`) is optional, as a login button or linked from Settings; dev login (`dev@cs2analyst.local`) in development only. FACEIT is linked separately (see below).
- **Storage**: demos are written to local disk (`data/demos/`). Cloudflare R2 is planned (session S7), not implemented yet.
- **Charts**: Recharts
- **2D Replay**: HTML5 Canvas API
- **Fonts**: Chakra Petch (headings, `font-display`, via `next/font/google`) + Geist Sans (`font-sans`) + Geist Mono (`font-mono`)

## Commands

```bash
npm run dev          # Start dev server (Turbopack); runs `prisma db push` first
npm run build        # Production build
npm run lint         # ESLint
npm run db:push      # Push Prisma schema to DB
npm run db:migrate   # Run Prisma migrations
npm run db:generate  # Generate Prisma client
npm run db:studio    # Open Prisma Studio
npm run test:clutches # Parser regression test (no demo file needed)
npm run test:replay   # Replay-data encoding regression test (no demo file needed)
npm run test:library  # Demo storage / deletion rule / limits / FACEIT filters test (no DB needed)
npm run test:mechanics # Movement/counter-strafe analysis regression test (no demo file needed)
npm run test:aim     # Aim/duels analysis regression test (no demo file needed)
npm run backfill:replay # Store replay data for old matches whose .dem is still on disk (the parse worker also does this on startup)
```

The GitHub CLI (`gh`) is installed and authenticated — use it to inspect CI,
pull requests and issues rather than asking for pasted logs:

```bash
gh run list --limit 5        # Recent CI runs
gh run view <id> --log-failed # Logs of the failing steps only
gh pr list / gh pr view <n>
gh issue list / gh issue view <n>
```

Read-only `gh` subcommands are allowlisted in `.claude/settings.json`. Anything
that writes (`gh pr create`, `gh issue create`, …) prompts for approval.

## Infrastructure

```bash
docker compose up -d   # Start PostgreSQL + Redis
```

DB credentials: `cs2analyst:cs2analyst@localhost:5432/cs2analyst`

## Project Structure

```
src/app/              — Next.js App Router pages
src/components/       — React components (ui/, charts/, maps/, replay/, layout/, auth/)
src/lib/              — Parsers, analysis, Steam API, utilities
src/stores/           — Zustand stores (replay)
src/styles/           — Global CSS with design tokens
workers/              — BullMQ worker processes
prisma/               — Schema & migrations
scripts/              — Backfills, debug scripts, no-demo regression tests
docs/                 — SESSIONS.md (roadmap)
```

## Code Conventions

- Strict TypeScript — no `any`
- Named exports for components
- Server Components by default, `"use client"` only when needed
- File naming: `kebab-case.tsx` (components), `camelCase.ts` (utilities)
- CSS: Tailwind utility-first, custom CSS only for Canvas/complex animations
- Stats/numbers: always use `font-mono` (Geist Mono)
- Path alias: `@/*` maps to `./src/*`

## Design System

- Dark-mode only — no light theme
- **Target palette: Violet Lime (Esport Neon).** Background `#08070D`, panel `#100E19`, raised panel `#181528`, text `#F3F0FF`, accent 1 violet `#9B6BFF`, accent 2 lime `#C6FF3D`, lines `rgba(190,160,255,0.12)`. Fixed meanings: CT `#5AA9FF`, T `#FFC23D`, mistake `#FF4D6A`, good decision `#3DF5A0`, warning `#FFB020`. Fonts: Chakra Petch (headings), Geist (text), Geist Mono (numbers).
- Design tokens are CSS custom properties in `src/styles/globals.css` and hold the Violet Lime values (migrated in S2). Style through the token names (`var(--accent)`, `var(--accent-2)`, `var(--ct-blue)`, `var(--mistake)` …), never hard-coded hex. Text on violet/lime/CT fills is `var(--on-accent)` (dark), never white. Canvas code that can't read CSS vars uses the same hex values as the tokens.
- UI kit (`src/components/ui/`, barrel `index.ts`): `Button` (variants `cta` lime — one per screen, `primary` violet, `secondary`, `ghost`, `danger`), `Card` + `CardHeader`, `StatCard` (`highlight` = lime best stat), `Badge`, `Input`, `Checkbox`, `Tabs*`, `Progress`, `FindingTag` (severity high/medium/low/good), `useToast()` (provider in the root layout). Uppercase labels use the `label-overline` class (not `overline`, which is Tailwind's text-decoration utility).
- Navigation lives in `src/components/layout/`: `AppShell` (used by `(dashboard)/layout.tsx` and `upload/layout.tsx`), grouped `Sidebar` ≥1024px (collapsible), `Topbar` + `MobileDrawer` below 1024px, `BottomNav` below 768px. Add new screens to `nav-items.ts` (groups Analiza / Narzędzia / Pro i drużyna; `soon: true` for planned ones).
- Full spec: `DESIGN.md`; quick reference: `.claude/skills/design-system/SKILL.md`

## FACEIT Integration

- **OAuth**: Manual OAuth2 + PKCE flow (NOT via NextAuth) at `/api/faceit/link` and `/api/faceit/link/callback`
- **Token exchange**: Uses HTTP Basic Auth header (`Authorization: Basic base64(client_id:client_secret)`)
- **Sync**: Fetches match history from FACEIT Data API, stores metadata in `FaceitMatch` model (map, score, date, faceitUrl)
- **Demo downloads**: Code exists (`/api/faceit/matches/[id]/download`, `workers/faceit-demo-download.worker.ts`, webhook `/api/faceit/webhooks/demo-ready`) but the FACEIT demo CDN requires Downloads API approval (pending). Until then users upload demos manually from the FACEIT matchroom. Downloads must only ever start on the player's explicit request.
- **HTTPS required**: FACEIT OAuth requires HTTPS redirect URIs. Dev server uses `--experimental-https` flag.
- **Dev cookies**: Self-signed cert breaks Secure cookies — all NextAuth cookies set to `secure: false` in dev via cookies config in `auth.ts`.
- **Routes**: FACEIT routes live under `/api/faceit/*` (NOT `/api/auth/*`) to avoid NextAuth `[...nextauth]` catch-all interception.
- **Env vars**: `FACEIT_API_KEY`, `FACEIT_CLIENT_ID`, `FACEIT_CLIENT_SECRET`

## npm 10 is pinned — do not "upgrade" it

`@laihoe/demoparser2@0.41.3` declares 14 `optionalDependencies` all pinned to `0.41.3`, but four of them do not exist at that version on the registry (`darwin-universal`, `darwin-x64` — which stops at `0.23.0` — `freebsd-x64`, `win32-ia32-msvc`). npm records unresolvable optional deps as `{"optional": true}` placeholder entries in the lockfile.

**npm 11 is self-inconsistent here**: its `npm install` strips those placeholders, and its `npm ci` then refuses the very lockfile it just wrote (`Missing: @laihoe/demoparser2-darwin-x64@ from lock file`). npm 10 also strips them, but its `npm ci` does not require them — so npm 10 is internally consistent and CI stays green regardless of lockfile churn.

Consequences:

- `engines.npm` is `^10` and `.npmrc` sets `engine-strict=true`, so npm 11 hard-fails with `EBADENGINE` instead of silently writing a lockfile that CI cannot install from.
- CI installs npm 10 explicitly before `npm ci`, because the Node 24 runner ships npm 11.
- To work on this repo: `npm install -g npm@10`.
- `packageManager` is **not** a substitute — plain npm ignores the field entirely, and corepack only enforces it after `corepack enable npm`.

Revisit once demoparser2 ships correct `optionalDependencies` (0.41.3 is the latest at the time of writing) or npm 11 fixes the install/ci mismatch.

## Key Architectural Decisions

- `@laihoe/demoparser2` is in `serverExternalPackages` (native Node.js bindings, server-only)
- Demo parsing runs in BullMQ workers, not in API routes (the ticks route only parses the .dem as a fallback for old matches without `RoundTicks`)
- **Sides are per-half, not per-match**: `parsePlayerInfo.team_number` gives the side a player *finished* on, while `round.winner` is an absolute side. Any logic comparing a player to a round-level side must resolve the side for that half or it silently inverts across the whole first half. Follow the `computeClutchWins()` pattern in `src/lib/parsers/demo-parser.ts`.
- **`assists` and `flashAssists` are disjoint**: a flash-assisted kill increments `flashAssists` only, never both. This is a deliberate divergence from HLTV (which folds flash assists into assists) — do not "unify" them. Add the columns together at the call site when comparing against HLTV numbers.
- Parser invariants that are easy to break have a no-demo regression test: `npm run test:clutches`
- **Replay data lives in the DB, not the .dem**: the parse pipeline stores sampled player state per round (`RoundTicks`, every 4 ticks, format in `src/lib/replay/round-ticks.ts`) plus every `weapon_fire` (`ShotEvent`) and `player_hurt` (`DamageEvent`). `/api/matches/[matchId]/ticks` reads `RoundTicks` and only falls back to parsing the .dem for old matches. Never delete a .dem unless `parseAndPersistDemo` returned `replayStored: true`. Changing the blob layout means bumping `REPLAY_FORMAT_VERSION`.
- **Demos are deleted after analysis** (S7): both workers call the rule in `src/lib/storage/demo-store.ts` (`shouldDeleteDemo`) — the .dem goes once replay data is stored, unless the upload has `keepDemo` or `DEMO_RETENTION=keep` is set (use that on a dev machine that needs demos for parser work). `DemoUpload.fileUrl` is a local path or `r2://<key>`; R2 is used when `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` are set (hand-rolled SigV4 in `src/lib/storage/r2.ts`, no AWS SDK). Deleting an analysis soft-deletes the upload (`deletedAt`) so the monthly limit still counts it. Plan limits live in `src/lib/limits.ts` (`PLAN_LIMITS`). FACEIT downloads only start from an explicit pick; without `FACEIT_DOWNLOADS_API_KEY` "Analyze selected" sends the player to `/upload?faceit=<ids>`.
- **Mechanics stats are derived from DB replay data, never the .dem**: `src/lib/analysis/movement.ts` (pure) computes `MechanicsStats` from `ShotEvent` / `DamageEvent` / `RoundTicks`; the parse pipeline stores them and `/mechanics/[matchId]` recomputes rows that are missing or older than `MECHANICS_VERSION`. Changing the analysis means bumping `MECHANICS_VERSION`.
- **Aim and duels (S9) follow the same pattern**: `src/lib/analysis/aim.ts` (pure) → `AimStats`, version `AIM_VERSION`, recomputed lazily by `/mechanics/[matchId]`. "When did the player see the enemy" comes from the game's own spotting (`approximate_spotted_by`, stored in `RoundTicks` format v2 as a bitmask over the blob's player list); v1 blobs (older matches, or a parser that can't read the prop) fall back to a FOV approximation with no reaction time. Reloads come from `ReloadEvent`. Advice only counts noise/jumps near enemies the player's team had seen (or that cost a hit).
- Tailwind v4 uses `@import "tailwindcss"` syntax (no config file needed)
- Settings page is a server component (queries DB directly for linked account status, not session JWT)
- FACEIT OAuth uses popup window + `postMessage` for cross-window communication
