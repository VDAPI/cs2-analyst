# CS2 Analyst

CS2 demo analysis SaaS. Users upload .dem files and get analytics: player stats, heatmaps, 2D replay, economy tracking, grenade analysis.

## Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack) + React 19 + TypeScript
- **Styling**: Tailwind CSS 4 + Radix UI primitives
- **State**: Zustand (client) + React Query / tRPC (server)
- **Database**: PostgreSQL + Prisma ORM
- **Cache/Queue**: Redis + BullMQ
- **Demo Parser**: @laihoe/demoparser2 (Rust/Node.js native bindings)
- **Auth**: NextAuth.js with Steam OpenID
- **Storage**: Cloudflare R2 (S3-compatible)
- **Charts**: Recharts + D3.js
- **2D Replay**: HTML5 Canvas API
- **Fonts**: Geist Sans + Geist Mono

## Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run db:push      # Push Prisma schema to DB
npm run db:migrate   # Run Prisma migrations
npm run db:generate  # Generate Prisma client
npm run db:studio    # Open Prisma Studio
```

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
src/styles/           — Global CSS with design tokens
workers/              — BullMQ worker processes
prisma/               — Schema & migrations
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
- Design tokens defined as CSS custom properties in `src/styles/globals.css`
- CT Blue (`#60a5fa`) / T Gold (`#fbbf24`) for team colors
- Brand accent: `#3b82f6`
- See `DESIGN.md` for full spec (if present)

## FACEIT Integration

- **OAuth**: Manual OAuth2 + PKCE flow (NOT via NextAuth) at `/api/faceit/link` and `/api/faceit/link/callback`
- **Token exchange**: Uses HTTP Basic Auth header (`Authorization: Basic base64(client_id:client_secret)`)
- **Sync**: Fetches match history from FACEIT Data API, stores metadata in `FaceitMatch` model (map, score, date, faceitUrl)
- **Demo downloads**: Not available — FACEIT demo CDN requires Downloads API approval (pending). Users upload demos manually from FACEIT matchroom.
- **HTTPS required**: FACEIT OAuth requires HTTPS redirect URIs. Dev server uses `--experimental-https` flag.
- **Dev cookies**: Self-signed cert breaks Secure cookies — all NextAuth cookies set to `secure: false` in dev via cookies config in `auth.ts`.
- **Routes**: FACEIT routes live under `/api/faceit/*` (NOT `/api/auth/*`) to avoid NextAuth `[...nextauth]` catch-all interception.
- **Env vars**: `FACEIT_API_KEY`, `FACEIT_CLIENT_ID`, `FACEIT_CLIENT_SECRET`

## Key Architectural Decisions

- `@laihoe/demoparser2` is in `serverExternalPackages` (native Node.js bindings, server-only)
- Demo parsing runs in BullMQ workers, not in API routes
- Tailwind v4 uses `@import "tailwindcss"` syntax (no config file needed)
- Settings page is a server component (queries DB directly for linked account status, not session JWT)
- FACEIT OAuth uses popup window + `postMessage` for cross-window communication
