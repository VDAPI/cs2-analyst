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

### Tick Data Fields (parseTicks)
- Position: `X`, `Y`, `Z`, `yaw`
- State: `health`, `is_alive`, `team_num`
- Weapons: `active_weapon_name`
- Economy: `balance`, `current_equip_value`, `cash_spent_this_round`, `total_cash_spent`

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

### Tick Sampling for Replay
- Sample every 32 ticks for smooth playback (~2 frames/second at 64 tick)
- Get round boundaries from DB, generate tick list: `range(startTick, endTick, 32)`
- Yields ~110 frames per round

## File Locations
- Parser: `src/lib/parsers/demo-parser.ts`
- Map configs: `src/lib/utils/maps.ts`
- Types: `src/types/index.ts` (ParsedDemo, ParsedRound, ParsedKill, etc.)
- Worker: `workers/demo-parser.worker.ts`
- Tick API: `src/app/api/matches/[matchId]/ticks/route.ts`
