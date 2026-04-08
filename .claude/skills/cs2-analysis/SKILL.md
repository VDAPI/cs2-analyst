---
name: cs2-analysis
description: Deep CS2 game knowledge for building analytics features. Covers what stats matter, how to interpret them, common analysis patterns, and what coaches/analysts look for. Use when building any analytics, stats display, or coaching feature.
---

# CS2 Analysis — What Matters & Why

## Match Format (MR12)
- First to 13 rounds wins (max 24 in regulation)
- 12 rounds per half, teams swap CT↔T at halftime
- Overtime: MR3 (3 rounds per side, $10,000 start money)
- Pistol rounds: Round 1 and Round 13 (after swap) — most impactful rounds
- Winning pistol usually means winning 3 rounds (pistol + 2 force/eco)

## Economy System — Critical for Analysis
- **Start money**: $800 (pistol round)
- **Kill reward**: varies by weapon ($300 rifle, $600 SMG, $100 AWP, $1500 knife)
- **Round loss bonus**: $1400 → $1900 → $2400 → $2900 → $3400 (stacks on consecutive losses, resets on win)
- **Win reward**: $3250 (bomb plant T win), $3500 (elimination), $3250 (defuse)
- **Bomb plant bonus**: +$800 to all T players regardless of round outcome

### Buy Types (what to detect and display)
- **Pistol**: rounds 1 & 13, $800 budget
- **Full Buy**: $4000+ spent, full armor + rifle/AWP + utility
- **Force Buy**: spending most money without full equipment (risky)
- **Half Buy**: partial equipment, saving some money
- **Eco**: minimal spend ($0-$1000), saving for next round
- **Full save / zero buy**: entire team saves everything

### Economy Analysis Red Flags
- Force buying after lost pistol (bad) vs eco-ing (standard)
- Not buying utility on full buy rounds
- Team economy not synchronized (some full buy, some eco)
- Losing rounds despite economic advantage (should highlight this)

## Core Stats — What Each Means

### Primary Stats
| Stat | Formula | Good | Average | Bad | Why It Matters |
|------|---------|------|---------|-----|----------------|
| K/D | kills/deaths | >1.2 | 0.9-1.2 | <0.9 | Basic fragging ability |
| ADR | total_damage/rounds | >85 | 65-85 | <65 | Consistent impact per round |
| HLTV 2.1 | composite (KPR, DPR, KAST, impact, ADR) | >1.15 | 0.95-1.15 | <0.95 | Overall performance rating |
| KAST% | % rounds with Kill/Assist/Survived/Traded | >75% | 65-75% | <65% | Consistency & team contribution |
| HS% | headshot_kills/total_kills | >50% | 35-50% | <35% | Aim precision (varies by weapon) |

### Advanced Stats — What Separates Good Analysis
| Stat | What It Shows | Analysis Value |
|------|--------------|----------------|
| **Opening Duel Win%** | First engagement success rate | Entry fragger effectiveness |
| **First Kill / First Death** | Opening kills vs opening deaths per match | Impact player vs liability |
| **Trade Kill %** | How often team trades deaths within 5 seconds | Team coordination quality |
| **Clutch Win %** | 1vX round wins | Individual skill under pressure |
| **Utility Damage** | HE + molotov damage per match | Utility usage quality |
| **Flash Assists** | Kills on players you flashed | Teamplay quality |
| **Enemies Flashed** | How many enemies blinded per flash | Flash effectiveness |
| **Survival Rate** | % of rounds survived | Positioning quality |
| **Multi-kill Rounds** | Rounds with 2+ kills | High impact rounds |
| **Entry Success Rate** | First kill in round wins vs losses | Entry trade value |
| **CT/T Rating Split** | Rating per side | Side-specific performance |

## Roles — Detect From Demo Data

### How to Identify Player Roles
- **Entry Fragger**: high first kills, low survival, aggressive positions
- **AWPer**: majority AWP kills, high ADR spikes, specific positions
- **Support**: high flash assists, high utility damage, low FK
- **Lurker**: kills from unexpected positions, late round kills, isolated from team
- **IGL (In-Game Leader)**: harder to detect from stats alone

### Role-Specific Benchmarks
- Entry: FK/FD ratio > 1.2 is very good
- AWPer: ADR might be lower but with high impact kills
- Support: Flash assists > 2/match is solid
- HS% varies by role: AWPer will be lower, rifler should be higher

## Grenade Analysis — What To Track

### Smoke Grenades
- **One-way smokes**: detect by throw position + landing position patterns
- **Execute smokes**: multiple smokes from same team in quick succession
- **Smoke timing**: early smoke = default setup, late smoke = execute
- **Smoke effectiveness**: did it block enemy vision during a kill event?

### Flashbangs
- **Pop flash**: flash + kill within 2 seconds = effective
- **Team flash**: flashing own teammates (negative, should flag)
- **Enemies flashed**: average per flash thrown
- **Flash duration on enemies**: longer = better throw

### Molotovs / Incendiaries
- **Area denial**: molotov on common positions (banana, connector)
- **Damage dealt**: average damage per molotov
- **Force movement**: did enemy move from position after molotov?

### HE Grenades
- **Damage per HE**: good = 40+, average = 15-40, wasted = <15
- **Stack nades**: multiple HEs on same target = coordinated play

## Heatmap Analysis — What To Visualize

### Kill Heatmaps
- Where a player gets most kills → shows strength positions
- Filter by side (CT/T) to see role-specific patterns
- Hot spots indicate favorite angles or positions

### Death Heatmaps
- Where a player dies most → shows vulnerability
- Clustered deaths = predictable positioning (bad)
- Deaths in same spot across rounds = not adapting

### Position Heatmaps (from tick data)
- Where a player spends most time → shows playstyle
- Compare to team average → identify lurkers/aggressive players
- Early round vs late round positions → rotation patterns

### Combined Analysis
- Kill heatmap vs death heatmap overlap → trading zones
- Team heatmap → default setups detection
- Cross-match patterns → anti-strat potential

## Round Categories — Important for Analysis

### Round Types to Detect and Tag
- **Pistol rounds**: 1 & 13 — track win rate separately
- **Eco rounds**: team total equipment < $5000
- **Force rounds**: buying despite low economy
- **Full buy vs full buy**: "gun rounds" — true skill test
- **Man advantage**: 5v4, 5v3 situations — should almost always win
- **Post-plant**: T side planted bomb — CT retake situation
- **Clutch**: 1vX — who, what round, did they win?
- **Anti-eco**: full buy vs eco — should win with high ADR

### Round Win Conditions
- Elimination: killed all enemies
- Bomb exploded: T win by detonation
- Bomb defused: CT win by defuse
- Time expired: CT win by clock
- Each tells a story about round dynamics

## Map-Specific Knowledge

### Map Sides (CT/T favor in competitive)
- **Mirage**: slightly CT-sided, mid control crucial
- **Inferno**: CT-sided, banana control key
- **Dust2**: balanced, mid doors important
- **Nuke**: heavily CT-sided, upper/lower control
- **Overpass**: slightly CT-sided, bathrooms/connector
- **Anubis**: balanced/slightly T-sided
- **Ancient**: slightly CT-sided, mid control
- **Vertigo**: CT-sided, ramp control
- **Train**: CT-sided, ivy/connector

### Key Positions Per Map (for heatmap analysis)
These positions should be labeled in heatmaps if possible:
- **Mirage**: window, connector, jungle, palace, ramp, short, apps
- **Inferno**: banana, apps, arch, pit, library, coffins
- **Dust2**: long doors, cat, B tunnels, mid, xbox, CT spawn

## What Coaches/Analysts Actually Look For

### Individual Review
1. Opening duels: where do they take them, win rate?
2. Crosshair placement in common spots
3. Utility usage: are they using all grenades? Effectively?
4. Deaths: avoidable? Caught rotating? Bad positioning?
5. Clutch decisions: right approach or panic plays?

### Team Review
1. Default setups: where does the team position by default?
2. Execute patterns: how do they take sites? What utility?
3. Retake success: can CT side retake after plant?
4. Economy management: is the team buying together?
5. Mid-round adaptation: do they rotate or commit?
6. Trading: do teammates trade deaths within 5 seconds?

### Anti-Strat (opponent analysis)
1. T-side defaults: where do they send players early round?
2. Execute tendencies: which site, which round types?
3. Star player positions: where does their best player play?
4. Utility patterns: predictable smoke/flash sequences?
5. Force buy strategy: what do they buy on force rounds?

## Data Quality Notes

### What demoparser2 CAN extract reliably
- All kill events with full detail (weapon, headshot, positions)
- Round boundaries and winners
- Player positions per tick (sample every 32 ticks for performance)
- Grenade events (throw, detonate, some trajectory data)
- Bomb events (plant, defuse, explode)
- Equipment values and buy money

### What's HARDER to extract
- Exact damage per hit (player_hurt events can be unreliable)
- Trade kills (need to calculate: death + teammate kill within ~5 seconds)
- KAST (requires tracking survived/traded per round)
- Flash effectiveness (player_blind event exists but duration varies)
- Clutch situations (need to calculate alive players at key moments)

### ADR Calculation
- Use player_hurt events, NOT kill damage
- Cap damage at victim's remaining HP (no overkill)
- Exclude friendly fire (attacker and victim on same team)
- Divide by total rounds played (not rounds alive)
