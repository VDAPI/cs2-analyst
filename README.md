# CS2 Analyst

> SaaS platform for Counter-Strike 2 demo analysis — player stats, heatmaps, 2D replay, economy tracking, grenade analysis, and AI coaching.

## Quick Start

### Prerequisites
- Node.js 20+
- Docker (for PostgreSQL + Redis)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Start database & Redis
docker compose up -d

# 3. Copy environment variables
cp .env.example .env
# Edit .env with your credentials

# 4. Initialize database
npx prisma db push
npx prisma generate

# 5. Start development server
npm run dev

# 6. (Optional) Start demo parsing worker
npm run worker:parse
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

```
┌─── Next.js 15 (App Router) ────────────────────┐
│  React 19 + TypeScript + Tailwind CSS            │
│  tRPC (type-safe API) + NextAuth (Steam OpenID)  │
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
│  Cloudflare R2 (demo file storage)               │
└─────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `PLAN.md` | Full project plan, roadmap, competitive research |
| `DESIGN.md` | Design system (colors, typography, components) |
| `AGENTS.md` | Instructions for AI coding agents |
| `prisma/schema.prisma` | Database schema |
| `src/types/index.ts` | Shared TypeScript types |
| `src/lib/parsers/` | Demo parsing logic |
| `src/lib/analysis/` | Stats calculation, heatmaps |
| `workers/` | Background job processors |

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS 4, Radix UI
- **State**: Zustand + React Query / tRPC
- **Backend**: Next.js API Routes, tRPC, BullMQ
- **Database**: PostgreSQL 16, Prisma ORM, Redis
- **Parser**: @laihoe/demoparser2 (Rust core, Node.js bindings)
- **Rendering**: Canvas API (2D replay), Recharts/D3 (charts)
- **Auth**: NextAuth.js with Steam OpenID
- **Storage**: Cloudflare R2

## License

Private — all rights reserved.
