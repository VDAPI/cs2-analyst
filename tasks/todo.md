# Phase 1 MVP

## Completed

### Setup (done)
- [x] Fix next.config.ts (serverExternalPackages)
- [x] Install geist fonts
- [x] Verify Tailwind v4 + PostCSS
- [x] Create CLAUDE.md

### Auth Refactor (done)
- [x] Email/password registration + login
- [x] Steam as optional OAuth provider
- [x] Steam linking from /settings
- [x] Dev login bypass
- [x] Route protection middleware

### UI Fixes (done)
- [x] Sidebar logo links to /matches
- [x] Back button on /upload page

### Demo Upload & Parsing (done)
- [x] Queue helper module (src/lib/queue.ts)
- [x] Upload API route (POST /api/uploads)
- [x] Upload status polling API (GET /api/uploads/[id]/status)
- [x] Demo parser transformation (demoparser2 → typed structures)
- [x] Worker: fix async bugs, complete DB batch inserts
- [x] Upload page: real upload + polling + redirect
- [x] Match detail page with scoreboard (/matches/[matchId])
- [x] Matches list page with real data

## Next Steps
- [ ] Test with real .dem file end-to-end
- [ ] Handle edge cases in parser (warmup rounds, overtime)
- [ ] R2 storage migration (replace local files)

# Phase 2 Features

## Player Comparison (done)
- [x] /compare page with player selector
- [x] /compare/[steamId1]/vs/[steamId2] comparison view
- [x] Radar chart (Recharts) with normalized stats
- [x] Side-by-side stat bars with highlighting
- [x] Head-to-head kill counts
- [x] Per-map breakdown table
- [x] Recent form sparklines (last 5 matches)

## FACEIT Integration (done — Phase 1)
- [x] Prisma schema: FaceitMatch model, User faceitId/faceitNickname/lastFaceitSync
- [x] FACEIT OAuth linking (manual OAuth2 + PKCE at /api/faceit/link)
- [x] Settings page: link/unlink FACEIT with confirmation modal
- [x] FACEIT sync: fetch match history, store metadata in FaceitMatch
- [x] Matches page: show FACEIT matches with badge, score, "View on FACEIT" link
- [x] "Sync FACEIT" button on matches page
- [x] Sync route reads faceitId from DB (not stale JWT)

## FACEIT Integration — Phase 2 (pending)
- [ ] FACEIT Downloads API approval (required for auto-downloading demos)
- [ ] Auto-download and parse FACEIT demos when Downloads API available
- [ ] Link manually uploaded demos to FaceitMatch records via faceitMatchId
- [ ] Upload page: accept faceitMatchId query param to pre-link upload

# Infrastructure

## CI (pending)
- [ ] Bump `actions/checkout` and `actions/setup-node` to `@v5` in
      `.github/workflows/ci.yml`. Both currently pin `@v4`, which targets
      Node 20; the runner already forces them onto Node 24 and emits a
      deprecation annotation on every run. Not urgent — CI is green — but it
      will break once runners drop the Node 20 shim. Small, self-contained.
