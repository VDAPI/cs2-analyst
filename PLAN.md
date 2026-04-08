# CS2 Analyst — Project Plan

> Publiczna aplikacja SaaS do analizy dem Counter-Strike 2

---

## 1. Competitive Research

### 1.1 Analiza konkurencji

| Platforma | Typ | Kluczowe funkcje | Model cenowy | Słabe strony |
|-----------|-----|-------------------|-------------|--------------|
| **Leetify** | Stats tracker + coaching | Aim/Utility/Positioning Rating, heatmapy, porównania, auto-import meczy MM/FACEIT, HLTV Rating, benchmarki rankowe, match reports | Freemium (Pro ~$4/mies.) | Brak 2D replay, ograniczone anti-strat |
| **Refrag** | Training + analysis | 2D Demo Viewer, Coach AI (auto-analiza meczy), NADR (granaty), Crossfire, Bootcamp, Academy, Restrat (multiplayer demo viewer) | $5.40-$15/mies. | Skupiony na treningu, analiza jest drugorzędna |
| **Noesis** | Demo analytics (pro) | 2D Demo Viewer, heatmapy, utility overlay, round filtering, anti-strat, team analysis | Freemium + Pro | Skupiony na pro scene, mniej funkcji dla casual |
| **Skybox EDGE** | Pro analytics | 2D Replayer, pro-level stats, team analysis, game prep, anti-strat | Free (Edge) + Team tiers | UI mniej intuicyjny |
| **Scope.gg** | Stats + coaching | Dashboard, match history, aim stats, grenade analysis, demo viewer, lineups, tactical board, pre-match analytics | Freemium | Mniejsza społeczność |
| **PureSkill.gg** | Automated coach | Auto-analiza, personalizowane porady, tracking progress | Freemium | Mniej granularnych danych |

### 1.2 Feature gap — nasza przewaga

- **Unified experience**: Połączenie najlepszych cech Leetify (stats), Noesis (2D replay), Refrag (coaching) w jednej platformie
- **AI-powered insights**: Zaawansowane rozpoznawanie wzorców (patternów gry) z użyciem ML
- **Social/team features**: Porównania, team boards, shared replays z komentarzami
- **Open API**: Publiczne API dla community tooling
- **Modern UX**: Dark-mode-first, responsywny, szybki — wzorowany na Linear/Raycast

---

## 2. Tech Stack

### 2.1 Rekomendowany stack

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                             │
│  Next.js 15 (App Router) + React 19 + TypeScript         │
│  Tailwind CSS 4 + Radix UI + Framer Motion               │
│  Recharts / D3.js (wykresy) + Canvas API (2D replay)     │
│  Zustand (state) + React Query (server state)            │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────┐
│                     BACKEND (API)                        │
│  Next.js API Routes + tRPC (type-safe API)               │
│  Bull MQ + Redis (job queue do parsowania dem)            │
│  NextAuth.js (auth via Steam OpenID)                     │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────┐
│                   DEMO PARSING LAYER                     │
│  @laihoe/demoparser2 (Rust/WASM bindings for Node.js)    │
│  Worker threads / BullMQ workers                         │
│  Opcjonalnie: demoinfocs-golang (Go microservice)        │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────┐
│                     DATABASE                             │
│  PostgreSQL 16 (główna baza) + Prisma ORM                │
│  Redis (cache + queues + sessions)                       │
│  ClickHouse (opcja: analytics warehouse do dużych query)  │
│  S3 / R2 (storage plików .dem)                           │
└─────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────┐
│                   INFRASTRUCTURE                         │
│  Vercel (frontend) + Railway/Fly.io (workers)            │
│  Cloudflare R2 (demo storage)                            │
│  Upstash Redis (serverless) lub self-hosted              │
│  Docker (dev environment)                                │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Dlaczego ten stack?

| Wybór | Powód |
|-------|-------|
| **Next.js 15** | Server Components dla SEO, App Router, API Routes — fullstack w jednym repo |
| **@laihoe/demoparser2** | Rust core (najszybszy parser), bindingi dla Node.js i WASM, actively maintained, query-based API |
| **PostgreSQL + Prisma** | Relacyjne dane (gracze, mecze, rundy), type-safe ORM, migracje |
| **Redis + BullMQ** | Parsowanie dem jest CPU-intensive — potrzebujemy queue + background workers |
| **tRPC** | End-to-end type safety frontend↔backend, idealne z Next.js |
| **Canvas API** | 2D replay wymaga wydajnego renderingu — Canvas > SVG dla animacji 10 graczy + granaty |
| **Zustand** | Lekki state management, idealne do replay state (tick, speed, selected player) |

### 2.3 Dostępne parsery CS2

| Parser | Język | Typ | Stars | Uwagi |
|--------|-------|-----|-------|-------|
| **demoparser2** (LaihoE) | Rust → Python/JS/WASM | Query-based | ~1k | **Rekomendowany** — najszybszy, Node.js bindings |
| **demoinfocs-golang** (markus-wa) | Go | Event-streaming | ~973 | Używany przez Noesis, Refrag, HLTV. Mature. |
| **awpy** | Python (Rust core) | DataFrame-based | ~1.8k | Polars DataFrames, świetne do analiz, wolniejszy startup |
| **demofile-net** (saul) | C# | Event-streaming | — | Blazing fast, cross-platform, CS2 + Deadlock |

**Strategia**: Primary parser = `@laihoe/demoparser2` (Node.js). Fallback/advanced = `demoinfocs-golang` jako Go microservice dla ciężkich batch operations.

---

## 3. Feature Roadmap

### Phase 1 — MVP (8-12 tygodni)
- [ ] **Auth**: Login via Steam OpenID
- [ ] **Demo Upload**: Upload .dem pliku, parsowanie w background, storage w R2
- [ ] **Match Overview**: Scoreboard, rundy, timeline, podstawowe statystyki (K/D/A, ADR, HLTV 2.1)
- [ ] **Player Stats**: Profil gracza, historia meczy, trend wyników
- [ ] **Round Timeline**: Lista rund z wydarzeniami (zabójstwa, bomba, wynik)
- [ ] **Basic 2D Replay**: Canvas-based top-down widok, pozycje graczy, tick-by-tick playback

### Phase 2 — Core Analytics (6-8 tygodni)
- [ ] **Heatmapy**: Pozycje zabójstw, śmierci, pozycji na mapie — filtrowane po stronie/rundzie/graczu
- [ ] **Grenade Analysis**: Trajektorie granatów (smoke/flash/molotov/HE), utility rating
- [ ] **Economy Tracker**: Wykres ekonomii obu drużyn, buy/eco/force rounds, equipment value
- [ ] **Player Comparison**: Side-by-side porównanie dwóch graczy (radar chart, stats overlay)
- [ ] **Auto-import**: Steam share codes → auto-parsowanie meczy MM
- [ ] **FACEIT integration**: Import dem z FACEIT

### Phase 3 — Pro Features (8-10 tygodni)
- [ ] **2D Replay Pro**: Utility timers, spread granatów, equipment overlay, round overlay (multi-round merge)
- [ ] **AI Coach**: Automatyczne wykrywanie błędów (złe pozycjonowanie, zmarnowane utility, timing)
- [ ] **Team Dashboard**: Zarządzanie drużyną, team stats, trendy
- [ ] **Anti-strat**: Analiza tendencji przeciwnika (defaulty, executes, retake patterns)
- [ ] **Tactical Board**: Rysowanie taktyk na mapie, sharing z drużyną
- [ ] **Clip Generator**: Auto-generowanie highlight clipów

### Phase 4 — Scale & Monetize
- [ ] **API publiczne**: REST/GraphQL API dla community devs
- [ ] **Subscription tiers**: Free / Pro / Team
- [ ] **Batch processing**: Import wielu dem naraz
- [ ] **Advanced ML**: Pattern recognition, playstyle fingerprinting
- [ ] **Mobile app**: React Native companion app

---

## 4. Data Model (uproszczony)

```
User
├── steamId, name, avatar, plan
├── has many → Match (through MatchPlayer)
└── has many → Team (through TeamMember)

Match
├── demoUrl, map, date, duration, server
├── has many → Round
├── has many → MatchPlayer
└── has one → MatchStats (aggregate)

Round
├── roundNumber, winner, winReason, endTick
├── has many → Kill
├── has many → GrenadeEvent
├── has many → BombEvent
└── has many → PlayerPosition (sampled ticks)

Kill
├── tick, attackerSteamId, victimSteamId
├── weapon, headshot, wallbang, throughSmoke
├── attackerPos(x,y,z), victimPos(x,y,z)
└── assistedBy, flashAssist

GrenadeEvent
├── tick, throwerSteamId, grenadeType
├── throwPos(x,y,z), landPos(x,y,z)
├── trajectory (JSON), duration
└── playersFlashed / damageDealt

PlayerRoundStats
├── roundId, steamId
├── kills, deaths, assists, damage
├── equipmentValue, cashSpent, moneyRemaining
└── positionSamples (JSON array of {tick, x, y, z})

Team
├── name, logo, members
└── has many → Match (team matches)
```

---

## 5. Monetization

| Tier | Cena | Zawartość |
|------|------|-----------|
| **Free** | $0 | 5 dem/mies., basic stats, 2D replay (ograniczony), 30 dni historii |
| **Pro** | ~$6/mies. | Unlimited dem, pełne heatmapy, grenade analysis, AI coach, 1 rok historii |
| **Team** | ~$15/mies. | 5 seats, team dashboard, anti-strat, tactical board, priority parsing, API access |

---

## 6. Nazewnictwo (propozycje)

- **DemoLab** — prosty, techniczny
- **Strats.gg** — gaming-native, .gg domena
- **Framecheck** — nawiązanie do tickrate/frames
- **Clutchview** — CS-native, emocjonalny
- **Tacticore** — taktyka + core
- **cs2analyst.gg** — opisowy, SEO-friendly

---

## 7. Kluczowe decyzje do podjęcia

1. **Nazwa i domena** — jaka domena chcesz zarejestrować?
2. **Język UI** — PL-only, EN-only, czy i18n od startu?
3. **Hosting** — Vercel + Railway vs self-hosted VPS?
4. **Demo storage** — Cloudflare R2 (tańszy) vs AWS S3?
5. **Parser strategy** — Pure Node.js (demoparser2) vs Go microservice hybrid?
6. **MVP scope** — zaczynamy od Phase 1, czy chcesz coś dodać/usunąć?
