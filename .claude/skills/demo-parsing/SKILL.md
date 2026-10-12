---
name: demo-parsing
description: CS2 demo parsing patterns using @laihoe/demoparser2. Covers raw event extraction, tick data, coordinate transforms, and common pitfalls. Use when building or debugging any demo parsing feature.
---

# Demo Parsing — Patterns & Knowledge

## Library: @laihoe/demoparser2

Native Rust/Node.js bindings. Server-only (in `serverExternalPackages`).

### Core APIs
- `parseHeader(filePath)` → map name, duration, tick rate, total ticks
- `parsePlayerInfo(filePath)` → authoritative 10-player roster with `steamid`, `name`, `team_number` (2=T, 3=CT at end of match)
- `parseEvent(filePath, eventName, extraFields?)` → array of event records
- `parseTicks(filePath, fields[], ticks[])` → per-player data at specific ticks
- `listGameEvents(filePath)` → all available event types

### Key Events
| Event | Fields | Use |
|-------|--------|-----|
| `round_end` | `winner`, `reason`, `tick` | Round results |
| `round_start` | `tick` | Round boundaries |
| `player_death` | `attacker_*`, `user_*`, `weapon`, `headshot`, `X/Y/Z` | Kill feed |
| `player_hurt` | `attacker_*`, `user_*`, `dmg_health`, `health`, `weapon` | Damage/ADR |
| `round_freeze_end` | `tick` | Economy snapshot timing |
| `begin_new_match` | `tick` | Real match start (last occurrence) |
| `announce_phase_end` | `tick` | Halftime marker |
| `bomb_planted/defused/exploded` | `user_*`, `X/Y/Z` | Bomb events |
| `player_blind` | `user_*`, `attacker_*`, `blind_duration` | Flash effectiveness (parsed today) |
| `weapon_fire` | `user_*`, `weapon`, `tick` | Every shot — base for S8–S9 mechanics (not parsed yet) |
| `weapon_reload` | `user_*`, `tick` | Reload timing (S9) |
| `player_footstep` / `player_jump` | `user_*`, `tick` | Sound and movement discipline (S9) |
| `smokegrenade_detonate`, `flashbang_detonate`, `hegrenade_detonate`, `inferno_startburn` | `X/Y/Z`, `entityid` | Utility landing points |

Pass extra player props to `parseEvent` (e.g. `["X","Y","Z","velocity_X","velocity_Y","pitch","yaw"]`) to get the shooter's state at the event tick without a separate `parseTicks` call.

### Tick Data Fields (parseTicks)
Used today:
- Position: `X`, `Y`, `Z`, `yaw`
- State: `health`, `is_alive`, `team_num`
- Weapons: `active_weapon_name`
- Economy: `balance`, `current_equip_value`, `cash_spent_this_round`, `total_cash_spent`

Needed for S6–S12 (names verified against demoparser2 0.41.3):
- View: `pitch`, `yaw` (degrees; yaw 0 = +X axis, counter-clockwise), `aim_punch_angle`
- Movement: `velocity_X`, `velocity_Y`, `velocity_Z` → horizontal speed `hypot(velocity_X, velocity_Y)` in units/s; `is_walking`, `is_strafing`, `duck_amount`, `ducking`
- Shooting: `shots_fired` (bullets in the current burst), `accuracy_penalty`, `is_scoped`, `is_in_reload`, `active_weapon_ammo`
- State: `armor_value`, `has_helmet`, `has_defuser`, `flash_duration`, `flash_max_alpha`
- Visibility: `spotted`, `approximate_spotted_by` (approximate — validate before trusting for "could the player see him")
- Inventory: `inventory` (utility left at death)

Sanity-check a new field on a real demo before building on it; props can be missing on some demos/builds, and `parseTicks` can throw (the economy code already wraps it in try/catch).

## Critical Patterns

### FACEIT Demos — Knife Round Filtering
FACEIT demos have a knife round before the real match. `begin_new_match` fires twice — use the **last** occurrence as `matchStartTick`. Filter all events with `tick > matchStartTick`.

### Team Side Swaps at Halftime
`parsePlayerInfo` gives team at END of match (second half sides).
- First half: `team_number=3` plays T-side, `team_number=2` plays CT-side
- Second half: `team_number=3` plays CT-side, `team_number=2` plays T-side
- Use `announce_phase_end` to detect halftime tick

### ADR Calculation (Accurate)
1. Sort `player_hurt` events by tick
2. Track HP per player per round (reset to 100 at round start)
3. Cap damage at victim's remaining HP: `actualDmg = Math.min(rawDmg, victimHp)`
4. Exclude self-damage (`attackerId === victimId`)
5. Exclude friendly fire (same team)
6. Divide total damage by total rounds played

**Pitfall**: `dmg_health` is raw weapon damage, NOT capped at HP. A glock headshot reports 108 but victim only had 100 HP.

### Economy Extraction
1. Parse `round_freeze_end` events to get freeze ticks
2. Call `parseTicks(file, ["team_num", "current_equip_value", "balance"], freezeTicks)`
3. Group by tick, sum equip/balance per team (accounting for side swap)
4. Classify buy type by avg equip per player:
   - Pistol: rounds 1 & 13
   - Eco: < $1000/player
   - Half: $1000–$2500
   - Force: $2500–$4000
   - Full: $4000+

### Coordinate Transform (Game → Radar Pixel)
```
pixelX = (gameX - mapConfig.posX) / mapConfig.scale
pixelY = (mapConfig.posY - gameY) / mapConfig.scale
```
Map configs in `src/lib/utils/maps.ts`. All radar images are 1024x1024.

### Tick Sampling for Replay — current state and S6 plan
**Today:** `src/app/api/matches/[matchId]/ticks/route.ts` parses the .dem **live** on each request: `range(startTick, endTick, 32)` + the end tick (≈2 frames/s at 64 tick, ~110 frames per round), props `X, Y, Z, yaw, health, is_alive, team_num, active_weapon_name`. It needs `upload.fileUrl` to still exist on disk. `workers/demo-parser.worker.ts` deletes FACEIT-sourced demos after parsing, so replay for those matches fails.

**S6 (planned):** the worker stores sampled ticks in the DB (about every 4 ticks: `X, Y, Z, velocity_X, velocity_Y, pitch, yaw, health, armor_value, is_alive, active_weapon_name, flash_duration`) in a compact per-round format (columnar JSON or bytea), plus all `weapon_fire` and `player_hurt` events; the ticks endpoint reads from the DB; a backfill script covers matches whose file still exists. Only after that may demos be deleted for every source (S7, with a "keep demo" flag).

Rule: **never add code that needs the .dem after parsing.** Anything an analysis needs later must be extracted in the worker and persisted.

## File Locations
- Parser: `src/lib/parsers/demo-parser.ts`
- Map configs: `src/lib/utils/maps.ts`
- Types: `src/types/index.ts` (ParsedDemo, ParsedRound, ParsedKill, etc.)
- Persistence: `src/lib/parsers/persist-demo.ts`
- Worker: `workers/demo-parser.worker.ts` (parse) and `workers/faceit-demo-download.worker.ts` (FACEIT download, awaiting Downloads API approval)
- Tick API: `src/app/api/matches/[matchId]/ticks/route.ts`
- Demo files: local `data/demos/<uploadId>.dem` (R2 planned in S7)
- No-demo regression test: `npm run test:clutches` (`scripts/test-clutch-wins.ts`) — add new parser invariants here or in a sibling script
