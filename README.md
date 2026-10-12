# CS2 Analyst

> SaaS platform for Counter-Strike 2 demo analysis — player stats, heatmaps, 2D replay, economy tracking, grenade analysis, FACEIT match sync. Planned: mechanics and tactics mistake reports, pro comparison and an AI coach (see `docs/SESSIONS.md`).

## Quick Start

**Just want to run and test it?** One command with Docker, no Node needed:
`docker compose up -d --build`, then open http://localhost:3000 (also from a
phone on the same Wi-Fi). Step-by-step guide in Polish: [`docs/TESTOWANIE.md`](docs/TESTOWANIE.md).

The steps below are for working on the code.

### Prerequisites
- Node.js 20+ (CI runs Node 24)
- npm 10 — `npm install -g npm@10` (npm 11 is blocked on purpose, see "npm 10 is pinned" in `CLAUDE.md`)
- Docker (for PostgreSQL + Redis)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Start database & Redis (plain `docker compose up` starts the whole app instead)
docker compose up -d postgres redis

# 3. Copy environment variables
cp .env.example .env
# Edit .env with your credentials

# 4. Initialize database
npx prisma db push
npx prisma generate

# 5. Start development server
npm run dev

# 6. Start the demo parsing worker (needed to analyse uploads; also backfills replay data for old matches)
npm run worker:parse

# 7. (Optional) FACEIT demo download worker
npm run worker:faceit
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

```
┌─── Next.js 15 (App Router) ────────────────────┐
│  React 19 + TypeScript + Tailwind CSS            │
│  Route Handlers + NextAuth (email/pass, Steam)   │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────┐
│  BullMQ Workers (demo parsing)                   │
│  @laihoe/demoparser2 (Rust → Node.js bindings)   │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────┐
│  PostgreSQL 16 + Prisma ORM                      │
│  Redis (cache + job queue)                       │
│  ml/ Python + LightGBM (win-probability trainer) │
│  Local disk data/demos (Cloudflare R2 planned)   │
└─────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `PLAN.md` | Original project plan and competitive research (roadmap moved to `docs/SESSIONS.md`) |
| `DESIGN.md` | Design system (colors, typography, components) |
| `CLAUDE.md` | Instructions for Claude Code / AI coding agents |
| `docs/SESSIONS.md` | Session-by-session roadmap and full feature list |
| `.claude/skills/` | Domain skills for Claude Code (design system, parsing, analysis, canvas) |
| `prisma/schema.prisma` | Database schema |
| `src/types/index.ts` | Shared TypeScript types |
| `src/lib/parsers/` | Demo parsing logic |
| `src/lib/analysis/`, `src/lib/utils/` | Heatmaps, clutches, trades, multi-kills, buy types |
| `workers/` | Background job processors |

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS 4, Radix UI
- **State**: Zustand (replay)
- **Backend**: Next.js Route Handlers, BullMQ
- **Database**: PostgreSQL 16, Prisma ORM, Redis
- **Parser**: @laihoe/demoparser2 (Rust core, Node.js bindings)
- **Rendering**: Canvas API (2D replay, heatmaps), Recharts (charts)
- **Auth**: NextAuth.js — email + password, optional Steam; FACEIT linked via OAuth2 + PKCE
- **Storage**: local disk today, Cloudflare R2 planned

## License

Private — all rights reserved.
