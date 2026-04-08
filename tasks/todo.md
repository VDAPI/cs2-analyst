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

### Demo Upload & Parsing (done — needs real demo testing)
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
- [ ] Add grenade event parsing
- [ ] Add tick data for heatmaps/replay
- [ ] R2 storage migration (replace local files)
