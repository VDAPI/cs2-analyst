# CS2 Analyst — Agent Instructions

## Project Overview
CS2 demo analysis SaaS application. Users upload Counter-Strike 2 .dem files and receive detailed analytics including player stats, heatmaps, 2D replay, economy tracking, and grenade analysis.

## Tech Stack
- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS 4 + Radix UI primitives
- **State**: Zustand (client) + React Query / tRPC (server)
- **Database**: PostgreSQL + Prisma ORM
- **Cache/Queue**: Redis + BullMQ
- **Demo Parser**: @laihoe/demoparser2 (Rust/Node.js bindings)
- **Auth**: NextAuth.js with Steam OpenID
- **Storage**: Cloudflare R2 (S3-compatible)
- **Charts**: Recharts + D3.js
- **2D Replay**: HTML5 Canvas API
- **Animation**: Framer Motion

## Architecture
- Monorepo structure with Next.js fullstack
- API routes via tRPC (`src/app/api/trpc/`)
- Background demo parsing via BullMQ workers (`workers/`)
- Prisma for DB schema and migrations (`prisma/`)

## Code Conventions
- Strict TypeScript — no `any` types
- Components use named exports
- Server Components by default, "use client" only when needed
- File naming: `kebab-case.tsx` for components, `camelCase.ts` for utilities
- CSS: Tailwind utility-first, custom CSS only for Canvas/complex animations
- All stats/numbers rendered with `font-mono` (Geist Mono)

## Design System
- Read DESIGN.md in project root for all colors, typography, components
- Dark-mode-native — no light theme
- CT Blue (#60a5fa) for Counter-Terrorist, T Gold (#fbbf24) for Terrorist
- Brand accent: #3b82f6

## Key Libraries
```
@laihoe/demoparser2  — CS2 demo parsing
@trpc/server + @trpc/client + @trpc/react-query — type-safe API
@prisma/client — ORM
bullmq — job queue
zustand — client state
recharts — charts
framer-motion — animations
@radix-ui/* — accessible UI primitives
next-auth — authentication
```

## File Structure
```
src/
  app/           — Next.js App Router pages
  components/    — React components
    ui/          — Base UI (buttons, inputs, cards)
    charts/      — Chart components (Recharts wrappers)
    maps/        — Map overlays, heatmaps
    replay/      — 2D replay canvas components
    layout/      — Sidebar, topbar, navigation
    auth/        — Login, user menu
  lib/
    parsers/     — Demo parsing logic & types
    analysis/    — Stats calculation, heatmap generation
    steam/       — Steam API integration
    utils/       — Helpers, formatters, constants
  hooks/         — Custom React hooks
  stores/        — Zustand stores
  types/         — Shared TypeScript types
  styles/        — Global CSS, Tailwind config
workers/         — BullMQ worker processes
prisma/          — Schema & migrations
public/
  maps/          — Radar images for all CS2 maps
  icons/         — Custom SVG icons
  weapons/       — Weapon SVG icons
```
