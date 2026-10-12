/**
 * English copy of the finding catalog (S15 coach, EN locale). Same keys as
 * FINDING_TYPES / CATEGORIES in src/lib/findings/catalog.ts; numbers and
 * drills must say exactly what the Polish source says. `npm run test:coach`
 * checks every type has an entry.
 */
import type { FindingCategory, FindingType } from "@/lib/findings/catalog";

export interface FindingTypeCopy {
  label: string;
  title: string;
  why: string;
  advice: string;
  drill: string;
  pro: string;
}

export const FINDING_TYPES_EN: Record<FindingType, FindingTypeCopy> = {
  // ─── Shooting (S8) ───
  moving_shot: {
    label: "Shot while moving",
    title: "You shoot while moving",
    why: "Above 34% of the weapon's max speed CS2 adds inaccuracy, so the first bullet misses the head.",
    advice: "Stop before you click: release the movement key and tap the opposite one (counter-strafe), then shoot.",
    drill: "Aim Botz: strafe A-D and shoot only after you've stopped, 5 minutes before every game.",
    pro: "pro: about 8–17% of first shots while moving",
  },
  late_strafe: {
    label: "Shot while still stopping",
    title: "You shoot before you finish stopping",
    why: "A shot fired mid counter-strafe still carries movement inaccuracy, even though it feels like you're standing still.",
    advice: "Stop earlier: start the counter-strafe when you see the edge of the wall, not when you see the enemy.",
    drill: "Prefire maps (e.g. Yprac): come out of the corner with a counter-strafe, shoot only at zero velocity (cl_showpos 1).",
    pro: "pro: stopped in about 45–70 ms",
  },
  first_bullet: {
    label: "1st-bullet accuracy",
    title: "Your first bullet rarely hits",
    why: "Most duels are decided by the first hit, and a spray after a missed first bullet hits far less often.",
    advice: "Keep your crosshair at head height and fire the first bullet standing still instead of spraying right away.",
    drill: "Aim Botz: 100 one-bullet kills (tapping) with the AK, standing still, then with a counter-strafe.",
    pro: "pro: about 42–55% first-bullet hits",
  },
  spray: {
    label: "Spray into nothing",
    title: "Your spray falls apart",
    why: "From the fourth bullet on, shots follow the recoil pattern; without control the rest of the spray misses.",
    advice: "At range, fire 3–5 bullet bursts instead of a full spray, and practise the full spray on a wall.",
    drill: "Recoil Master / the wall on Aim Botz: AK and M4 pattern, 10 sprays each per day.",
    pro: "pro: about 25–35% hits from the 4th bullet on",
  },
  air_shot: {
    label: "Shot in the air",
    title: "You shoot in the air",
    why: "In the air every weapon except the SSG at the top of the jump is wildly inaccurate.",
    advice: "Don't shoot mid-jump; land, stop, and only then shoot.",
    drill: "In your warm-up, jump over an obstacle and shoot only after landing and stopping.",
    pro: "pro: almost 0 shots in the air except with the SSG",
  },

  // ─── Aim (S9) ───
  crosshair: {
    label: "Crosshair placement",
    title: "Your crosshair isn't waiting for the enemy's head",
    why: "When your crosshair sits far from where the enemy appears, you need a big mouse movement and lose time.",
    advice: "Keep your crosshair at head height on the edge an enemy can come from; don't aim at walls or the floor.",
    drill: "On an empty server, walk your side's routes and set your crosshair at head height on every corner.",
    pro: "pro: about 5–10° from the head when the enemy appears",
  },
  reaction: {
    label: "Slow reaction",
    title: "You react too slowly",
    why: "An enemy who sees you for the same amount of time shoots first if your reaction takes longer than 300–400 ms.",
    advice: "Play positions where you expect the enemy from one direction, so you react instead of searching.",
    drill: "Aim Lab / KovaaK's: Reflex Shot or Spidershot, 10 minutes a day.",
    pro: "pro: about 90–250 ms after the game spots the enemy",
  },
  ttd: {
    label: "Time to damage",
    title: "Too long to your first hit",
    why: "The time from seeing an enemy to damaging them decides who wins the duel.",
    advice: "Work on crosshair placement and stopping before you shoot; those are what cut your time to damage.",
    drill: "Aim Botz: bots coming out from a corner, time how long your first hit takes.",
    pro: "pro: about 400–750 ms",
  },
  overflick: {
    label: "Overflick",
    title: "You overshoot your flicks",
    why: "A flick that passes the head needs a second correction and gives the enemy time to shoot.",
    advice: "Lower your sensitivity or aim closer to the enemy before the peek, so the flick is shorter.",
    drill: "KovaaK's / Aim Lab: flick scenarios with small targets, focus on stopping on the target, not on speed.",
    pro: "pro: about 15–35% of flicks overshot",
  },
  headshots: {
    label: "Headshots",
    title: "Few headshots",
    why: "A rifle headshot kills instantly; to the body you need 3–4 bullets.",
    advice: "Keep your crosshair at head height, not body height, also while moving around the map.",
    drill: "Aim Botz in headshot-only mode (mp_damage_headshot_only 1), 100 kills.",
    pro: "pro: about 20–28% headshot hits (all hits, not kills)",
  },
  preaim: {
    label: "Pre-aim",
    title: "Few hits from pre-aim",
    why: "A hit without a big correction is the fastest hit; it takes good prediction of where the enemy is.",
    advice: "Learn the common enemy positions on the map and peek with your crosshair already on them.",
    drill: "Prefire maps (Yprac) on your maps, every position in order.",
    pro: "pro: about 33–52% of hits from pre-aim",
  },

  // ─── Duels and peeks (S9) ───
  dry_peek: {
    label: "Dry peek",
    title: "You dry peek and lose",
    why: "A peek without a flash or a trade gives the enemy a free shot at you, and when you die your team loses a player for nothing.",
    advice: "Before peeking a known position, ask for a flash or go so a teammate can trade you.",
    drill: "Learn 2–3 self pop-flashes on every map (Yprac / lineups on YouTube).",
    pro: "pro: about 30–55% of dry peeks lost",
  },
  reload: {
    label: "Bad-timing reload",
    title: "You reload near the enemy",
    why: "For about 2.5 s of reloading you can't shoot, and a known enemy can swing in that time.",
    advice: "Reload hidden behind a wall or only when your mag is low; near an enemy, finish with your pistol.",
    drill: "After every kill in DM: first take cover, only then reload.",
    pro: "pro: about 1–5 such reloads per match",
  },

  // ─── Movement and sound (S9) ───
  noise: {
    label: "Running near enemies",
    title: "You run near enemies and give away your position",
    why: "Footsteps can be heard from about 1100 units; the enemy knows where you are and waits with their crosshair ready.",
    advice: "Within earshot of a known enemy, shift-walk; only run when they can already see you or a teammate is fighting.",
    drill: "In a match: before you leave a passage near a known enemy, switch to walking.",
    pro: "pro: about 4–12 such runs per match",
  },
  jump: {
    label: "Needless jump",
    title: "You jump near enemies",
    why: "Landing after a jump makes noise, and you can't hit anything in the air.",
    advice: "Near enemies, only jump to get onto a ledge or to gather info with a jump-peek, never before a fight.",
    drill: "Learn jump-peeks for 2–3 AWP angles on your maps instead of plain jumps.",
    pro: "pro: about 1–5 jumps near enemies per match (jump-throws included)",
  },

  // ─── Utility (S11) ───
  smoke_early: {
    label: "Smoke too early",
    title: "You throw your smokes too early",
    why: "A smoke lasts about 18 s; thrown before anyone gets there, it fades before the enemy comes in, and your team is left without a grenade for later.",
    advice: "Save your smoke to react: as CT throw it when you hear the push or your team spots an enemy; as T throw it with your team's entry, not just in case.",
    drill: "On your own server (sv_grenade_trajectory_prac_pipreview 1), learn 2 smokes per bombsite you can throw within 2 s from a defensive position.",
    pro: "pro: CT smokes usually thrown on contact or info, rarely in the first 20 s",
  },
  smoke_void: {
    label: "Smoke into nothing",
    title: "Your smokes don't block anyone",
    why: "A smoke that blocks no line between your team and the enemy and that nobody uses is $300 with no effect.",
    advice: "Before you throw, ask yourself: who will this smoke block and who on my team will use it? If nobody, save it for later.",
    drill: "After the match, go through your smokes in the 2D replay and note which line of fire each one blocked.",
    pro: "pro: about 10% of smokes with no impact on the round",
  },
  flash_blind: {
    label: "Flash blind time",
    title: "Your flashes barely blind",
    why: "A flash that blinds an enemy for less than a second gives your team no time to entry or shoot.",
    advice: "Throw pop-flashes from behind a wall so they pop over the edge in the enemy's view, not in front of you or behind them.",
    drill: "Your own server with bots: 3 pop-flashes per bombsite; check how long they blind the bots.",
    pro: "pro: about 1.1–2.0 s of enemy blind per flash",
  },
  team_flash: {
    label: "Team flash",
    title: "You flash your own team",
    why: "A blinded teammate won't win the duel, and the enemy hears the flash and knows you're about to push.",
    advice: "Before you throw, call \"flashing A\" and throw over your teammate or behind them, never in front of them.",
    drill: "With a teammate on a server: they peek, you throw a pop-flash over them until you don't blind them 5 times in a row.",
    pro: "pro: about 0.15–0.5 s of teammate blind per flash",
  },
  flash_no_peek: {
    label: "Flash with no follow-up",
    title: "You flash, but nobody peeks",
    why: "A blinded enemy is about 2 s of advantage; if nobody peeks or shoots during that time, the flash is wasted.",
    advice: "Only flash when you or a teammate swing on the blinded enemy straight away; sync it with a \"flashing, going\" call.",
    drill: "Learn 2 self-flashes (throw and peek within 1 s) on every map you play.",
    pro: "pro: about 60–80% of flashes that blinded an enemy are followed by a peek",
  },
  he_no_effect: {
    label: "HE with no effect",
    title: "Your HE grenades deal no damage",
    why: "A $300 HE that hits nobody is money and an inventory slot with no return.",
    advice: "Throw HEs where the enemy is right now (after info, at a stack during the entry), ideally together with a teammate or after a flash that landed.",
    drill: "Learn HEs for 2–3 common positions on every map (e.g. around a corner onto boxes) and combine them with a molotov.",
    pro: "pro: about 8–19 HP of damage per HE",
  },
  molotov_no_effect: {
    label: "Molotov with no effect",
    title: "Your molotovs land in empty spots",
    why: "A molotov costs $400–500; with no damage and no enemy flushed out of a position, it's money lost for the round.",
    advice: "Throw your molotov on a position you know about (info, sound, a common spot during the entry), or to stop a rush when you hear it.",
    drill: "Learn molotovs for 3 common defensive positions on each bombsite of your maps.",
    pro: "pro: about 4–11 HP of damage per molotov",
  },
  nade_team_damage: {
    label: "Nade into teammates",
    title: "Your grenades hurt your teammates",
    why: "Every HP a teammate loses to your HE or fire makes the fight easier for the enemy.",
    advice: "Before throwing an HE or molotov, check the radar that nobody on your team is standing in or moving into that spot.",
    drill: "When executing with your team, agree on the order: grenades first, then the entry.",
    pro: "pro: almost 0 team damage from grenades",
  },
  death_with_utility: {
    label: "Death with utility",
    title: "You die with unused grenades",
    why: "Grenades in a dead player's pocket are wasted money; used before the fight they'd have given info, time or an advantage.",
    advice: "Before you take a fight, use at least one grenade: a flash before the peek, a molotov on a position, a smoke to cut a line.",
    drill: "Every round at 1:00, ask yourself: which grenade can I use for my team right now?",
    pro: "pro: about $140–280 of unused utility per death",
  },
  lineup_miss: {
    label: "Lineup off target",
    title: "Your smokes and molotovs land next to the usual spot",
    why: "A smoke a few metres off target leaves a gap the enemy can see through, and a molotov next to a position flushes nobody out.",
    advice: "Learn the lineup for that spot: enter the setpos/setang command from the card on your own server and repeat the throw.",
    drill: "Your own server (sv_cheats 1, sv_infinite_ammo 1): every lineup from the card 10 times, until it lands the same every time.",
    pro: "pro: smokes from lineups, 0–1 missed per match",
  },

  // ─── Teamplay (S12) ───
  untraded_death: {
    label: "Untraded death",
    title: "You die where nobody can trade you",
    why: "A death with no teammate in trade range is a pure loss: the enemy gives nothing back and your team plays a man down.",
    advice: "Play within range of a teammate (up to about 3 s of running) or don't take the duel alone; info first, then fight together.",
    drill: "In your next match, before every peek check the radar for someone in trade range.",
    pro: "pro: about 14–27% of deaths traded by the team",
  },
  missed_trade: {
    label: "Missed trade",
    title: "You don't trade your teammates",
    why: "An enemy who just got a kill is standing in a known spot and is often reloading; it's the easiest frag of the round.",
    advice: "When a teammate dies next to you, swing on their killer right away (ideally from a different angle), before they reposition.",
    drill: "Retake/DM in pairs: one peeks, the other stays 1–2 m behind and trades within 2 s.",
    pro: "pro: about 27–50% of trade chances taken",
  },
  entry_death: {
    label: "Unsupported entry",
    title: "You entry first with no support",
    why: "An entry only makes sense if someone trades right after; a lone opening death leaves your team in a 4v5.",
    advice: "Go onto the bombsite with a teammate right behind you and a flash; if nobody's coming, wait for your team.",
    drill: "Agree with your team on 1 entry per map: who flashes, who goes first, who trades.",
    pro: "pro: about 50% of opening duels won, losses usually traded",
  },
  lurk_death: {
    label: "Lurk with no impact",
    title: "You lurk and die for nothing",
    why: "A lurker gives the team info and cuts off rotations; dying far from the team before the plant gives nothing and weakens the entry.",
    advice: "On a lurk, gather info and wait for your team to move; take the fight when your team hits or from behind rotating CTs.",
    drill: "Watch 3 of your lurk rounds in the replay: where your team was, when you died, when the CTs rotated.",
    pro: "pro: a lurker rarely dies before the plant without a frag",
  },
  early_rotation: {
    label: "Early rotation",
    title: "You rotate too early",
    why: "Rotating off a fake leaves your bombsite empty; the Ts plant without a fight and the retake gets much harder.",
    advice: "Only leave the bombsite after confirmed info (3+ enemies, the bomb, a teammate's call), not on sound alone.",
    drill: "For your CT positions, agree with your team on what info you rotate on, and stick to it for the whole match.",
    pro: "pro: rotate after 3+ enemies or the bomb are confirmed",
  },
  postplant_death: {
    label: "Post-plant fight",
    title: "After the plant you hunt frags instead of playing the clock",
    why: "After the plant, time is on the Ts' side: every needless fight gives the CTs a chance to retake with the numbers advantage.",
    advice: "After the plant, take a crossfire position on the bomb and wait for the CTs to come to you; don't peek first.",
    drill: "On every map, learn 2 post-plant positions for bombsite A and B.",
    pro: "pro: about 70% of post-plant rounds won",
  },
  retake_solo: {
    label: "Solo retake",
    title: "You go into the retake alone",
    why: "On a retake the Ts wait in set positions; a player going in alone dies and leaves the team further down in numbers.",
    advice: "Group up with your teammates before going in and hit together with utility, from different sides, at the same moment.",
    drill: "A retake server (Retakes) on your maps, 15 minutes focusing on going in together.",
    pro: "pro: retakes start with 2+ players together with utility",
  },

  // ─── Economy (S12) ───
  bad_force: {
    label: "Badly timed force",
    title: "Your force buy costs you a full buy",
    why: "A lost force takes the money that, with a save, would have been a full buy next round.",
    advice: "Only force in rounds you must win (last round of the half, match point) or when you couldn't full-buy after a save anyway.",
    drill: "Before every round, check your team's minimum money for the next round (loss bonus) and decide together.",
    pro: "pro: force mostly in the 2nd round and at match point",
  },
  no_drop: {
    label: "No drop",
    title: "You don't drop for your teammate",
    why: "A teammate without a gun is one player short of a full buy; a drop evens out the team economy.",
    advice: "When you have enough left for a second gun after buying, buy one for a broke teammate (drop with G) while still in freeze time.",
    drill: "After every freeze time, look at the money table (Tab) and ask who needs a drop.",
    pro: "pro: 0 rounds with a broke teammate when someone has money for a drop",
  },
  death_with_money: {
    label: "Death with money",
    title: "You die with a lot of money",
    why: "Unspent money doesn't help in the round: you're missing utility, armor or a better gun, and in the last round of the half the money is lost.",
    advice: "Spend the rest on utility and armor or drop a gun; in the last round of the half, spend everything.",
    drill: "On a full buy, always have the full set: armor with helmet, smoke, flash and molotov/HE.",
    pro: "pro: about $0–500 unspent on a full buy",
  },

  // ─── Positioning (S12) ───
  predictable_position: {
    label: "Predictable position",
    title: "As CT you stand in the same spot every round",
    why: "After a few rounds the opponents know where you stand and come with utility or pre-aim on your spot.",
    advice: "Every 2–3 rounds change your position or timing (a different angle, aggression, falling back); be where the enemy doesn't expect you.",
    drill: "For every bombsite on your map, prepare 3 CT positions and rotate through them during the half.",
    pro: "pro: about 45–75% of CT rounds in the same spot, but with different timing and utility",
  },
  clutch_decision: {
    label: "Clutch decision",
    title: "Bad decisions in clutches",
    why: "In a clutch, time and the bomb matter, not the number of frags; a bad decision costs the round or your gun for the next one.",
    advice: "Count the time: as CT with no chance to defuse, save your gun; as T with the bomb, play the clock and don't go looking for fights.",
    drill: "Watch your clutches in the replay and for each one note: time, number of enemies, the bomb and what the best option was.",
    pro: "pro: save when there's no chance to defuse",
  },
};

export const CATEGORIES_EN: Record<FindingCategory, { label: string; description: string }> = {
  shooting: { label: "Shooting", description: "Movement while shooting, counter-strafe, first bullet and spray." },
  aim: { label: "Aim", description: "Crosshair placement, reaction, flicks and headshots." },
  duels: { label: "Duels and peeks", description: "How you take fights: peeks, flashes from your team, reloads." },
  sound: { label: "Movement and sound", description: "Footsteps and jumps that give away your position." },
  utility: { label: "Utility", description: "Smokes, flashes, molotovs and HEs: timing, placement, effect." },
  teamplay: { label: "Teamplay", description: "Trades, rotations, entry, lurk, post-plant and retake." },
  economy: { label: "Economy", description: "Force buys, drops, dying with a lot of money." },
  positioning: { label: "Positioning", description: "Predictable positions and clutch decisions." },
};
