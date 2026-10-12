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
npm run db:push      # Push Prisma schema to DB (runs prisma/pre-push.sql first: indexes db push can't add without --accept-data-loss)
npm run db:migrate   # Run Prisma migrations
npm run db:generate  # Generate Prisma client
npm run db:studio    # Open Prisma Studio
npm run test:clutches # Parser regression test (no demo file needed)
npm run test:sides   # Round winner/reason codes, per-round sides incl. overtime (no demo file needed)
npm run test:e2e-demo -- <file.dem> # Parser invariants on a real demo (score, economy sides, deaths, utility damage)
npm run test:replay   # Replay-data encoding regression test (no demo file needed)
npm run test:library  # Demo storage / deletion rule / limits / FACEIT filters test (no DB needed)
npm run test:mechanics # Movement/counter-strafe analysis regression test (no demo file needed)
npm run test:aim     # Aim/duels analysis regression test (no demo file needed)
npm run test:findings # Findings + "what to improve" report regression test (no demo file needed)
npm run test:utility  # Utility analysis, lineup base and callouts regression test (no demo file needed)
npm run test:tactics # Trades / economy / positions / clutch analysis regression test (no demo file needed)
npm run test:platform # Share codes, replay links, Steam history, PL/EN parity, notification text (S18)
npm run test:scouting # Scouting room-link parsing / map strength / veto test (no DB or network needed)
npm run test:admin   # Admin access rule / daily metrics / parse-time / stuck detection test (no DB needed)
npm run admin:grant -- <email>  # Promote an existing account to ADMIN (no args: every address in ADMIN_EMAILS)
npm run test:norms   # Pro / rank norms: samples, percentiles, side split, ranks, reference coverage (no DB needed)
npm run pro:import   # Parse the pro demos in data/pro-demos/ (or a folder given after --) into the pro pool, rebuild norms
npm run norms:refresh # Sample matches without norm samples and rebuild every norm (the parse worker does this itself)
npm run test:progress # Progress trends, goals, badges, player identity, share tokens/slugs test (no DB needed)
npm run test:winprob # Win-probability features, tree scoring parity with LightGBM, finding costs, pro situations (no DB needed)
npm run ml:install   # pip install the Python trainer (ml/requirements.txt)
npm run ml:train     # Train / compare win-probability models on the DB, store the best (ml/cs2ml/train.py)
npm run ml:serve     # Run the trainer as an HTTP service on :8765 (what the docker compose `ml` service runs)
npm run ml:test      # pytest for the trainer (synthetic data, no DB)
npm run test:coach   # AI coach: weekly plan, drills, rating-based order, "no invented numbers" check, PL/EN (no DB or API key needed)
npm run test:training # Daily routine, .cfg files, lineup trainer (better lineup for a finding, mastered) test (no DB needed)
npm run test:e2e     # Playwright E2E (S19): needs Postgres + Redis and a DB named cs2analyst_e2e; builds and starts the app on :3100
npm run test:e2e:update-snapshots # Regenerate the visual baselines in the Playwright Docker image (same as CI)
npm run setup:local  # Schema + test account test@cs2analyst.local / test1234 with 3 sample analyses + sample demo (idempotent; run by Docker's `setup`)
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
docker compose up -d postgres redis   # Only PostgreSQL + Redis, for `npm run dev`
docker compose up -d --build          # The whole app (S20 local test environment), see below
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
- UI kit (`src/components/ui/`, barrel `index.ts`): `Button` (variants `cta` lime — one per screen, `primary` violet, `secondary`, `ghost`, `danger`), `Card` + `CardHeader`, `StatCard` (`highlight` = lime best stat), `Badge`, `Input`, `Checkbox`, `Tabs*`, `Progress`, `FindingTag` (severity high/medium/low/good), `useToast()` (provider in the root layout), `PageHeader` (every screen's h1, back link, actions), `EmptyState`, `SectionTitle`. Match helpers in `src/components/match/` (`ResultBadge` W/P/R, `resultFor`, `MapThumb`, `SourceBadge`). Wide tables: `<div className="table-scroll"><table className="data-table">` (sticky first column). Dates: `formatDate`/`formatDateTime` from `src/lib/utils/formatters.ts` (pl-PL), never bare `toLocaleDateString()`. App UI copy is Polish. Uppercase labels use the `label-overline` class (not `overline`, which is Tailwind's text-decoration utility).
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
- **Sides are per-round, not per-match**: `parsePlayerInfo.team_number` gives the side a player *finished* on, while `round.winner` is an absolute side (demoparser2 returns `round_end` winner/reason as numbers: 2 = T, 3 = CT; mapped in `src/lib/parsers/round-end.ts`). Sides swap at halftime and every overtime half, and a match can end before halftime, so never assume "rounds ≤ 12 are swapped". The parser resolves teamA's side per round from live `team_num` (`resolveTeamASides`); pages and APIs use `createSideResolver(rounds)` from `src/lib/utils/sideSplit.ts` (reads the stored winner + score deltas). Regression tests: `npm run test:clutches`, `npm run test:sides`; on a real demo `npm run test:e2e-demo -- <file.dem>`.
- **`assists` and `flashAssists` are disjoint**: a flash-assisted kill increments `flashAssists` only, never both. This is a deliberate divergence from HLTV (which folds flash assists into assists) — do not "unify" them. Add the columns together at the call site when comparing against HLTV numbers.
- Parser invariants that are easy to break have a no-demo regression test: `npm run test:clutches`
- **Replay data lives in the DB, not the .dem**: the parse pipeline stores sampled player state per round (`RoundTicks`, every 4 ticks, format in `src/lib/replay/round-ticks.ts`) plus every `weapon_fire` (`ShotEvent`) and `player_hurt` (`DamageEvent`). `/api/matches/[matchId]/ticks` reads `RoundTicks` and only falls back to parsing the .dem for old matches. Never delete a .dem unless `parseAndPersistDemo` returned `replayStored: true`. Changing the blob layout means bumping `REPLAY_FORMAT_VERSION`.
- **Demos are deleted after analysis** (S7): both workers call the rule in `src/lib/storage/demo-store.ts` (`shouldDeleteDemo`) — the .dem goes once replay data is stored, unless the upload has `keepDemo` or `DEMO_RETENTION=keep` is set (use that on a dev machine that needs demos for parser work). `DemoUpload.fileUrl` is a local path or `r2://<key>`; R2 is used when `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` are set (hand-rolled SigV4 in `src/lib/storage/r2.ts`, no AWS SDK). Deleting an analysis soft-deletes the upload (`deletedAt`) so the monthly limit still counts it. Plan limits live in `src/lib/limits.ts` (`PLAN_LIMITS`). FACEIT downloads only start from an explicit pick; without `FACEIT_DOWNLOADS_API_KEY` "Analyze selected" sends the player to `/upload?faceit=<ids>`.
- **Mechanics stats are derived from DB replay data, never the .dem**: `src/lib/analysis/movement.ts` (pure) computes `MechanicsStats` from `ShotEvent` / `DamageEvent` / `RoundTicks`; the parse pipeline stores them and `/mechanics/[matchId]` recomputes rows that are missing or older than `MECHANICS_VERSION`. Changing the analysis means bumping `MECHANICS_VERSION`.
- **Aim and duels (S9) follow the same pattern**: `src/lib/analysis/aim.ts` (pure) → `AimStats`, version `AIM_VERSION`, recomputed lazily by `/mechanics/[matchId]`. "When did the player see the enemy" comes from the game's own spotting (`approximate_spotted_by`, stored in `RoundTicks` format v2 as a bitmask over the blob's player list); v1 blobs (older matches, or a parser that can't read the prop) fall back to a FOV approximation with no reaction time. Reloads come from `ReloadEvent`. Advice only counts noise/jumps near enemies the player's team had seen (or that cost a hit).
- **Findings and the report (S10)**: a `Finding` row is one detected mistake at one moment (type, player, round, tick, severity, numbers, one piece of advice, enemy for the clip). `src/lib/findings/catalog.ts` (`FINDING_TYPES`: category, advice, drill, pro reference, weight, clip window) is the single list of types; pure detectors in `detect.ts` turn the stored MechanicsStats/AimStats moments into `FindingDraft`s; `report.ts` groups them into issues, attaches the match metric, ranks them and picks the top 3. Findings are rebuilt lazily when `Match.findingsVersion` differs from `FINDINGS_STAMP` (findings + mechanics + aim + tactics + utility versions). S11/S12 add a type to the catalog, a detector to `detectFindings` and (optionally) a metric to `playerMetrics`; the report, replay markers and finding cards need no change. Pro values in the catalog are reference numbers until S13 norms replace them. Report: `/report/[matchId]`; replay deep link `?round=&tick=&player=&finding=`; 2D clip: `FindingClip` (`src/components/replay/finding-clip.tsx`, loads a tick window via `/ticks?from=&to=`).
- **Utility (S11)**: `src/lib/analysis/utility.ts` (pure) → `UtilityStats` (version `UTILITY_VERSION`, recomputed lazily by the findings like aim): smokes too early / into the void, team flashes, flashes nobody followed up, HE/molotov without effect or into teammates, death with unused grenades. Judged by what the team knew: a smoke/molotov thrown after the team spotted an enemy near its landing is never "wasted". Who a flash blinded comes from `flashDuration` in `RoundTicks` (teammates too); throws come from grenade `weapon_fire` rows in `ShotEvent`, linked to `GrenadeEvent` detonations. Inventory at death is `Kill.victimInventory` (parsed since S11, null before). Callout names come from `last_place_name` sampled once a second at parse time and summed per map on a 128-u grid (`MapPlaceCell`, `places.ts`); old maps have no names until a new demo of that map is parsed. The lineup base (`lineups.ts`) is learned, not hand-written: throws from every match's `UtilityStats.throws` clustered by origin/angles/landing (≥3 throws in ≥2 matches), shown on `/lineups` with setpos/setang; a smoke/molotov landing off a known lineup gets a `lineup_miss` Finding with the command.
- **Tactics (S12)**: `src/lib/analysis/tactics.ts` (pure) → `TacticsStats` (version `TACTICS_VERSION`, recomputed lazily by `getTacticsStats`, which the findings call) from `Kill`, `DamageEvent`, `BombEvent`, `RoundPlayer` (money/equipment at freeze end) and `RoundTicks`. Types: untraded death, missed trade (nearest teammate within ~900 u, 3 s window), entry / lurk death (T), early rotation (CT left the planted site while the team had seen < 3 enemies — skipped without spotting data), post-plant death, solo retake, clutch decision (save / no plant / play time), bad force (loss-bonus estimate says a save would have full-bought), no drop, death with unspent money, predictable CT spot (position 20 s after freeze end, same spot ≥ 70% of a half). Sides per round come from the frames' team, with the regulation halves as fallback for rounds without frames. Rounds without frames still get trade/economy/clutch findings, not distances or positions.
- **Pro and rank norms (S13)**: `src/lib/norms/`. Pro demos are ordinary uploads with `DemoUpload.pro` owned by the system user `pro-pool@cs2analyst.local` (no password, so they never show up for a player), added from `/admin/pro` or `npm run pro:import`; nothing is ever downloaded from HLTV (its terms forbid scraping and business use). After findings, the parse pipeline stores `NormSample` rows (`build.ts`, pure): the S8–S12 analyses re-run on the match's stored inputs (`load*Input` in `persist-*.ts`) for the whole match and per side (rounds split by the side one team played, frames first, regulation halves as fallback), and every player's `playerMetrics` become `{ "<metric>@<situation>": [value, samples] }` (situation = weapon class for moving_first/first_bullet/hs). `refreshNorms` aggregates them into `MetricNorm` percentiles per pool (`pro`, `all`, rank bucket `faceit:7` / `premier:15000` / `competitive:12`), map (+ `all`) and side; right after a pro demo, otherwise at most every `NORMS_REFRESH_MS`, plus a startup backfill in the parse worker. Samples are rebuilt when `NORMS_STAMP` (norms + analysis versions) changes. Ranks: `MatchPlayer.rankType/rankValue` from the FACEIT match room (FACEIT uploads, needs `FACEIT_API_KEY`), the demo's `rank`/`comp_rank_type` props (Premier, competitive), or a linked account's current FACEIT level. `proNorm` falls back to `reference.ts` (estimates, shown with ≈) until a metric has `MIN_NORM_N` pro player-matches. Every metric in `playerMetrics` needs a direction, unit, reference value, `/pro` group and PL/EN label (`test:norms` checks). The report shows pro and rank medians at every metric plus a "Ty vs pro" table; `/pro` shows all norms with map/side/rank filters and the player's own median.
- **Opponent scouting (S23)**: `/scouting` takes a FACEIT room link; `POST /api/scouting` fetches the room plus profile, lifetime stats and last 20 matches of all 10 players from the Data API (no demos), each through the Postgres cache `FaceitApiCache` (`src/lib/scouting/cache.ts`, TTLs in `CACHE_TTL`). Map strength and the veto suggestion are pure (`src/lib/scouting/analysis.ts`) and run on the client so the player can switch sides and who bans first.
- **Admin panel and monitoring (S27)**: `/admin` (overview, `/admin/analyses`, `/admin/users`) is guarded in `(dashboard)/admin/layout.tsx` and every `/api/admin/*` route via `getAdminUser()` (`src/lib/admin/session.ts`), which reads the role from the DB, never the JWT. Admin = `User.role ADMIN`, or the dev login in development; non-admins get a 404. Emails are not verified, so `ADMIN_EMAILS` never grants admin at runtime (anyone could register a listed address first): the first admin registers, then runs `npm run admin:grant -- <email>` on the server (no args = every address in `ADMIN_EMAILS`), which sets `role ADMIN` on that existing account. Emails are stored trimmed + lowercase (`normalizeEmail` in `src/lib/email.ts`, used by register and login); `@cs2analyst.local` and Steam's `@steamcommunity.com` pseudo addresses can't be registered. Admins retry failed or stuck (in flight, untouched for `STUCK_AFTER_MS`) analyses without the player's monthly limit (shared `retryUpload()` in `src/lib/retry.ts`), and change plan, role or `User.monthlyDemoLimit` (per-user override read by `checkMonthlyDemoLimit`). Metrics are pure (`src/lib/admin/metrics.ts`, days in Europe/Warsaw); parse time is `DemoUpload.parseMs`, set by `parseAndPersistDemo`. Queue lengths come live from BullMQ with a 2 s timeout. **Sentry** is off unless `SENTRY_DSN` is set: the app via `src/instrumentation.ts` + `sentry.client.config.ts` (`next.config.ts` wraps with `withSentryConfig` and copies the DSN to `NEXT_PUBLIC_SENTRY_DSN` only then; source maps upload with `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`), the workers via `src/lib/monitoring/worker-sentry.ts` (final job failures only).
- **E2E tests (S19)**: Playwright, `e2e/` (`screens/` read-only specs incl. a screenshot of every screen, then `flows/` that change data), projects `desktop` 1280 px and `mobile` 360 px. Global setup pushes the schema to `cs2analyst_e2e`, runs `scripts/e2e-seed.ts` (E2E account `e2e@cs2analyst.local`, 3 analysed matches + 1 pro demo) and starts the parse worker; every spec fails on a browser console error. Demos are fixtures: `src/lib/parsers/fixture-demo.ts` simulates a de_mirage match and answers `parseHeader`/`parsePlayerInfo`/`parseEvent`/`parseTicks` when `E2E_FIXTURE_DEMOS=1` (all parser access goes through `loadDemoParser()` in `src/lib/parsers/load-parser.ts`, so a new parser call needs the prop/event in the fixture too). A new screen goes into `SCREENS` in `e2e/screens/screens.spec.ts`; parts that depend on today's date are masked there. Baselines live in `e2e/screens/__screenshots__` and are rendered in `mcr.microsoft.com/playwright:v<version>-noble` (CI runs the `e2e` job in it). `npm run test:e2e-demo -- --fixture` (in CI) runs the real-demo parser checks on the fixture, so it stays faithful to demoparser2 output.
- **Progress and sharing (S16)**: `/progress` reads the user's matches through `loadProgress()` (`src/lib/progress/load.ts`, stored MechanicsStats/AimStats/Finding counts, no recompute) and pure `src/lib/progress/` (metrics, trend, goals, badges, identity). Report metrics over a window are judged by summing raw counts and running `playerMetrics()` on the sum, so thresholds live only in `report.ts`; a new report metric needs an entry in `PROGRESS_METRICS` (test fails otherwise). Badges are computed, never stored; `Goal.achievedAt` is set the first time the last-5 average meets the target. Public links: `Share` rows (`/s/<token>`, kind `report` or `moment`, revoked not deleted) and the opt-in profile `/u/<User.publicSlug>`. Replay data routes (`ticks`, `kills`, `grenades`, `bombs`, `notes`) authorise through `getMatchAccess()` (`src/lib/sharing/access.ts`): the uploader, or `?share=<token>` of a live link (a moment link only reads its round). `MapNote` holds world coordinates (`makeCanvasToWorld` in `src/lib/canvas/radar.ts`).
- **Win probability and "what would a pro do" (S14)**: `src/lib/winprob/` (pure except `persist.ts`). `features.ts` turns a round's `RoundTicks` + kills + bomb events into `WP_FEATURES` (absolute per side, NaN = not applicable, target P(T wins)); changing them means bumping `WP_FEATURES_VERSION`. Models are JSON specs scored in TS (`model.ts`): the hand-fitted prior (`prior-model.json`, from public round stats via `ml/fit_prior.py`) until the Python trainer (`ml/cs2ml/`, LightGBM) stores a better `WinProbModel` (≥ 20 matches, cross-validated by match, must beat the prior on log loss; alive/HP/equipment are monotone-constrained so a death never helps its team). Training runs in the `ml` docker service (`ML_SERVICE_URL`) or as a local `python3 -m cs2ml.train --if-new-data` spawned after analyses (`ML_PYTHON`, throttled); never blocks an analysis. Each analysis stores `WinProbData` (snapshot rows the trainer reads); pro matches also store `ProSituation` rows (`situations.ts`: every alive player every 2 s + the action in the next 5 s). Finding cost (`impact.ts`, `IMPACT_RULE`) is counterfactual on the same tick (death → player revived; team flash → mate revived; missed trade → killer dead and his later victims alive; no drop → mate with a rifle) and clamped so a loss never shows as a gain; stored as `Finding.wpBefore/wpAfter/wpKind`. The findings stamp includes the model id and `IMPACT_VERSION`, so a new model rebuilds findings lazily. `/api/matches/[id]/findings/[fid]/pro` = k-nearest pro situations (same map/side/bomb, ±1 alive when < 12 exact). Pro matches are readable by any signed-in user through `getMatchAccess` (for the pro clips). WPA (`series.ts`) per kill against the victim revived. Admin: `/admin/ml`.
- **AI coach (S15)**: `/coach` (weekly plan) and the "Trener AI" card on `/report/[matchId]`. Everything that decides something is pure code in `src/lib/coach/`: `plan.ts` (focuses = the report's window issues re-ranked by ratings, max 3 and 2 per category; weekly targets from `PROGRESS_METRICS` goals; 7-day schedule), `drills.ts` (the only source of exercises; Workshop maps link to a Workshop search, never guessed item ids), `ranking.ts` (ratings → weight per finding type). Claude only writes prose (`ai.ts`: official SDK, `beta.messages.parse` + `betaZodOutputFormat`, `fallbacks: "default"`, effort medium; model `COACH_MODEL`, default `claude-opus-5-5`; off without `ANTHROPIC_API_KEY`). Facts sent to the model are built in `facts.ts`; `grounding.ts` drops any AI text whose numbers aren't in those facts and the standard text (`text.ts`, catalog copy in PL or `catalog-en.ts`) takes its place. `TrainingPlan` (one per user and week, rebuilt by the workers after each analysis via `refreshPlanAfterAnalysis` and on view when its hash changes), `CoachText` (AI text cache per match/plan and language, `AI_DAILY_LIMIT` per user), `CoachFeedback` (thumbs per finding type and context). Changing prompts or schemas means bumping `COACH_PROMPT_VERSION`; changing the plan's shape, `PLAN_VERSION`. A new finding type needs an English entry in `catalog-en.ts` and a drill (`test:coach` fails otherwise).
- **Training generator and lineup trainer (S22)**: `/training` (daily routine) and the trainer on `/lineups`. Pure code in `src/lib/training/`: `routine.ts` turns one day of the S15 weekly plan into items with the Workshop map, minutes and a numeric target (never new drills or targets; those stay in `plan.ts`/`drills.ts`); `lineup-trainer.ts` finds the throw behind a grenade finding (`throwForFinding`, `UtilityStats.throws` by round + detonation tick) and the lineups to practise instead (`practiceLineups`), and the day's not-yet-mastered lineups; `cfg.ts` writes the downloadable `.cfg` files (`/api/training/cfg?kind=lineups|routine`): no key binds, every alias prefixed `cs2a_`, echo/comment text folded to ASCII without quotes or semicolons (`cfgText`), the grenade practice server is `PRACTICE_SETTINGS` (sv_cheats 1, sv_infinite_ammo 1, sv_grenade_trajectory_prac_pipreview 1 …). Finding types in `LINEUP_FINDING_TYPES` (smoke too early / void, molotov without effect, lineup off target) get a "Ćwicz lineup" link to `/lineups?finding=<id>` on the report card and in the replay. "Mastered" marks are `LineupMastery` rows keyed by `Lineup.key`, so changing how `buildLineups` builds keys orphans them.
- **Tool canvases share one toolkit** (S5): replay, heatmaps and grenades draw through `src/lib/canvas/` (token-mirroring colors, world→canvas, radar, heatmap layer, replay drawing) inside `MapViewport` (`src/components/maps/`, touch pan/zoom + tap-to-select). Size markers with `useCanvasUiScale` so they stay readable at 360 px. Details: `.claude/skills/replay-canvas/SKILL.md`.
- Tailwind v4 uses `@import "tailwindcss"` syntax (no config file needed)
- **PL/EN (S18)**: `src/lib/i18n/` — `messages/pl.ts` is the source, `messages/en.ts` must have the same keys (type-checked + `test:platform`). Server: `const { t } = await getT()` (`@/lib/i18n/server`); client: `const t = useT()` (`@/lib/i18n/client`). Locale = `locale` cookie (set by `/api/user/locale`, also stored in `User.locale` for push), default Polish. New UI copy goes through `t()`. Screens not yet migrated still have inline Polish; browser-language detection stays off (`DETECT_BROWSER_LANGUAGE`) until they are.
- **Notifications (S18)**: workers call `notifyUploadFinished()` (`src/lib/notifications/notify.ts`) when an upload ends COMPLETED/FAILED → `Notification` row (top-bar bell) + Web Push via `web-push` to every `PushSubscription`. Text is rendered from type + data in the reader's language, never stored. VAPID keys: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`, otherwise generated once into `AppSetting`.
- **PWA (S18)**: `src/app/manifest.ts`, icons in `public/pwa/`, service worker `public/sw.js` (registered by `PwaProvider` in the root layout; `?dev=1` in dev disables asset caching). Pages are never cached (per-user); offline falls back to `/offline`.
- **Premier / Steam (S18, opt-in)**: `/premier`. Share codes decode in `src/lib/steam/share-code.ts`; `SteamMatch` rows. Only Valve replay links (`replayN.valve.net/730/…dem.bz2`, checked by `parseReplayUrl`) are ever downloaded, by the `steam-demo-download` queue that lives inside the parse worker, and only after the player clicks "Analyze". History sync uses the player's own Steam auth code + `STEAM_API_KEY` and only runs on "Sync". `UploadSource.STEAM`.
- **Local test environment (S20)**: `docker compose up -d --build` runs everything from one image (`Dockerfile`, Debian `node:22-bookworm`, npm 10): `setup` (one-off: `npm run setup:local` = db push + `scripts/local-seed.ts`), `app` (`next start`, http://localhost:3000 and http://<LAN IP>:3000 for phones), `worker`, `worker-faceit`, Postgres, Redis, MinIO (`pgsty/minio`, the official image is gone from Docker Hub) and `https` (Caddy, https://localhost:3443, self-signed, for FACEIT OAuth which needs a registered https redirect: `FACEIT_OAUTH_BASE_URL`, `src/lib/faceit/oauth.ts`). Demos go to MinIO through the R2 client (`R2_ENDPOINT` + `R2_REGION` instead of `R2_ACCOUNT_ID`; `r2EnsureBucket` creates the bucket). One app on several origins works because `AUTH_TRUST_HOST=true` (NextAuth takes the origin from the request) and `src/middleware.ts` reads whichever session cookie name the request carries (`__Secure-` on https, plain on http). `.env` is optional and passed at runtime (never baked: `.dockerignore`); the compose `environment` block overrides its addresses. The seed's sample matches are the E2E fixture demo run through the real pipeline (fixture parser switched on for the seed process only). Smoke test: `bash scripts/local-smoke.sh` (CI: `.github/workflows/local-env.yml`, only when Docker-related paths change). Guide for the owner: `docs/TESTOWANIE.md` (Polish).
- Settings page is a server component (queries DB directly for linked account status, not session JWT)
- FACEIT OAuth uses popup window + `postMessage` for cross-window communication
