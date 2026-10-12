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

> Pierwotna rekomendacja. Faktyczny stack opisuje `CLAUDE.md` (m.in. bez tRPC i React Query, logowanie email + hasło ze Steam opcjonalnie, dema na lokalnym dysku do czasu R2).

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

> Stan na 12.10.2026. Szczegółowy, aktualny plan pracy to `docs/SESSIONS.md` (sesje S1–S18 i pełna lista funkcji).
> Ta sekcja zostaje jako historia pierwotnego planu; przy każdej pozycji jest sesja, która ją realizuje.
> `[x]` jest w kodzie · `[~]` częściowo · `[ ]` jeszcze nie.

### Phase 1 — MVP
- [x] **Auth**: email + hasło (główne logowanie), Steam opcjonalnie (logowanie lub podpięcie w ustawieniach), dev login
- [~] **Demo Upload**: upload .dem i parsowanie w tle (BullMQ) działa; storage w R2 → S7 (dziś lokalny dysk `data/demos/`)
- [x] **Match Overview**: scoreboard, rundy, K/D/A, ADR, HLTV rating, clutche, trade'y, multi-kille, opening duels
- [x] **Player Stats**: profil gracza, historia meczów, trend wyników
- [x] **Round Timeline**: lista rund z wydarzeniami
- [x] **Basic 2D Replay**: Canvas, pozycje graczy, odtwarzanie tick po ticku (dane czytane z pliku .dem → do bazy w S6)

### Phase 2 — Core Analytics
- [x] **Heatmapy**: zabójstwa, śmierci, pozycje; per mecz i zbiorczo per mapa
- [x] **Grenade Analysis**: trajektorie granatów, utility damage
- [x] **Economy Tracker**: wykres ekonomii, typy zakupów, koordynacja zakupów
- [x] **Player Comparison**: radar, statystyki obok siebie, head-to-head, mapy, forma
- [ ] **Auto-import**: Steam share codes → S18 (dla chętnych, obok uploadu)
- [~] **FACEIT integration**: OAuth PKCE i synchronizacja historii działają; pobieranie dem czeka na zgodę Downloads API, wybór meczów i kolejka → S7

### Phase 3 — Pro Features
- [ ] **2D Replay Pro**: stożek widzenia, timery utility, HP, broń, znaczniki błędów → S10
- [ ] **AI Coach**: wykrywanie błędów mechaniki (S8–S9) i taktyki (S11–S12), raport „co poprawić” (S10), normy pro (S13), model szansy wygranej (S14), rady językiem naturalnym (S15)
- [ ] **Team Dashboard** → S17
- [ ] **Anti-strat** → S17
- [ ] **Tactical Board** → S17
- [ ] **Clip Generator**: klip 2D błędu → S10

### Phase 4 — Scale & Monetize
- [ ] **API publiczne**: poza obecnym planem sesji
- [~] **Subscription tiers**: plany FREE/PRO/TEAM i miesięczny limit dem (`src/lib/limits.ts`) są; płatności później, limity darmowego planu → S7
- [ ] **Batch processing**: upload wielu plików i „Analizuj zaznaczone” → S7
- [ ] **Advanced ML**: model szansy wygranej i „co zrobiłby pro” → S14
- [ ] **Mobile**: zamiast osobnej aplikacji — wersja mobilna każdego ekranu (od S2) i PWA → S18

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

> Ustalone 12.10.2026: na start darmowe z limitem meczów, płatności później. W kodzie (`src/lib/limits.ts`) limit to dziś FREE 10 / PRO 100 / TEAM bez limitu dem miesięcznie; docelowe limity → S7.
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

1. **Nazwa i domena** — otwarte.
2. **Język UI** — ustalone: PL/EN → S18.
3. **Hosting** — otwarte.
4. **Demo storage** — ustalone: Cloudflare R2 (S7); plik .dem kasowany po analizie, w bazie zostaje raport i dane replaya, opcja „zachowaj demo”.
5. **Parser strategy** — w praktyce: Node.js (demoparser2) w workerach BullMQ; model szansy wygranej jako osobna usługa w Pythonie (S14).
6. **MVP scope** — MVP i Phase 2 są w kodzie; dalsza kolejność w `docs/SESSIONS.md`.
