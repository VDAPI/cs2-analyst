/**
 * Drill library of the AI coach (S15): concrete exercises (Workshop maps,
 * community servers, review in our own tools) with a duration and a way to
 * measure them, mapped to the finding types they train. The weekly plan picks
 * drills from here; the AI only writes prose around them, so it can never
 * invent a map or an exercise. Pure, covered by `npm run test:coach`.
 */
import type { FindingType } from "@/lib/findings/catalog";
import type { Locale } from "@/lib/i18n/config";

export type DrillId =
  | "aim_botz_tap"
  | "aim_botz_strafe"
  | "prefire"
  | "recoil"
  | "reflex"
  | "dm_discipline"
  | "walk_discipline"
  | "nade_practice"
  | "lineups"
  | "flash_practice"
  | "retake_servers"
  | "trade_review"
  | "position_review"
  | "economy_review";

export interface DrillText {
  name: string;
  /** What to do, one or two sentences. */
  how: string;
  /** How to know it went well (a number where possible). */
  measure: string;
}

export interface DrillDef {
  id: DrillId;
  /** Where it happens: a Workshop map, an online server, or a screen of the app. */
  where: "workshop" | "server" | "app";
  /** Workshop map name, searched on the Steam Workshop (no guessed item ids). */
  workshop?: string;
  /** App screen for review drills. */
  appPath?: string;
  /** "{map}" in the Workshop name is replaced with the player's main map. */
  perMap?: boolean;
  minutes: number;
  /** Short enough to open every session with. */
  warmup?: boolean;
  types: FindingType[];
  pl: DrillText;
  en: DrillText;
}

export const DRILLS: Record<DrillId, DrillDef> = {
  aim_botz_tap: {
    id: "aim_botz_tap",
    where: "workshop",
    workshop: "Aim Botz - Training",
    minutes: 10,
    warmup: true,
    types: ["first_bullet", "headshots", "crosshair"],
    pl: {
      name: "Aim Botz: pierwsza kula",
      how: "AK-47, bez ruchu: 100 botów jednym strzałem w głowę, celownik cały czas na wysokości głów.",
      measure: "Licz pudła pierwszej kuli; cel: mniej niż 30 na 100.",
    },
    en: {
      name: "Aim Botz: first bullet",
      how: "AK-47, standing still: 100 bots with one shot to the head, crosshair kept at head height.",
      measure: "Count first-bullet misses; target: fewer than 30 per 100.",
    },
  },
  aim_botz_strafe: {
    id: "aim_botz_strafe",
    where: "workshop",
    workshop: "Aim Botz - Training",
    minutes: 10,
    warmup: true,
    types: ["moving_shot", "late_strafe", "air_shot", "first_bullet"],
    pl: {
      name: "Aim Botz: counter-strafe",
      how: "Strafe A-D, stuknij przeciwny klawisz i strzel dopiero po zatrzymaniu. Włącz cl_showpos 1 i patrz na prędkość.",
      measure: "Strzał tylko przy prędkości 0; cel: 50 zabójstw bez strzału w ruchu.",
    },
    en: {
      name: "Aim Botz: counter-strafe",
      how: "Strafe A-D, tap the opposite key and shoot only once you have stopped. Turn on cl_showpos 1 and watch your velocity.",
      measure: "Shoot only at velocity 0; target: 50 kills without a moving shot.",
    },
  },
  prefire: {
    id: "prefire",
    where: "workshop",
    workshop: "Yprac {map} Prefire",
    perMap: true,
    minutes: 15,
    types: ["crosshair", "preaim", "late_strafe", "reaction", "dry_peek", "overflick", "ttd"],
    pl: {
      name: "Prefire {map}",
      how: "Przejdź trasy prefire z counter-strafe'em na każdym rogu, celownik ustawiony przed wyjściem zza ściany.",
      measure: "Przejście trasy bez pudła pierwszą kulą; zapisz czas i popraw go o kilka sekund.",
    },
    en: {
      name: "{map} prefire",
      how: "Run the prefire routes with a counter-strafe at every corner, crosshair placed before you clear the wall.",
      measure: "A clean run without a first-bullet miss; note your time and beat it by a few seconds.",
    },
  },
  recoil: {
    id: "recoil",
    where: "workshop",
    workshop: "Recoil Master - Spray Training",
    minutes: 10,
    types: ["spray"],
    pl: {
      name: "Recoil Master: spray",
      how: "Wzór AK-47 i M4A1-S po 10 serii na ścianie, potem na botach z 15 m.",
      measure: "Seria 10 kul w sylwetce; cel: co najmniej 7 trafień na 10.",
    },
    en: {
      name: "Recoil Master: spray",
      how: "AK-47 and M4A1-S pattern, 10 sprays each on the wall, then on bots from 15 m.",
      measure: "A 10-bullet spray on a body; target: at least 7 hits out of 10.",
    },
  },
  reflex: {
    id: "reflex",
    where: "workshop",
    workshop: "Fast Aim / Reflex Training",
    minutes: 10,
    types: ["reaction", "ttd", "overflick"],
    pl: {
      name: "Reflex Training",
      how: "Tryb z małymi celami: krótki, kontrolowany flick i zatrzymanie ręki na celu zamiast przelatywania.",
      measure: "Celność w trybie; cel: wynik lepszy niż wczoraj przy celności powyżej 80%.",
    },
    en: {
      name: "Reflex Training",
      how: "Small-target mode: a short, controlled flick and stopping your hand on the target instead of flying past it.",
      measure: "Accuracy in the mode; target: beat yesterday's score with accuracy above 80%.",
    },
  },
  dm_discipline: {
    id: "dm_discipline",
    where: "server",
    workshop: undefined,
    minutes: 15,
    types: ["moving_shot", "first_bullet", "headshots", "spray", "reload", "crosshair"],
    pl: {
      name: "Deathmatch z zasadą",
      how: "FFA deathmatch na serwerze społeczności z jedną zasadą tygodnia (np. tylko strzały z miejsca, przeładowanie tylko za osłoną).",
      measure: "Policz zabójstwa złamaniem zasady w ostatnich 5 minutach; cel: 0.",
    },
    en: {
      name: "Deathmatch with a rule",
      how: "Community FFA deathmatch with one rule for the week (e.g. only shots while standing, reload only behind cover).",
      measure: "Count kills where you broke the rule in the last 5 minutes; target: 0.",
    },
  },
  walk_discipline: {
    id: "walk_discipline",
    where: "server",
    minutes: 10,
    types: ["noise", "jump", "reload", "dry_peek"],
    pl: {
      name: "Retake/DM: cicho w kontakcie",
      how: "Na serwerze retake chodź z Shiftem przez ostatnie metry przed miejscem, gdzie wróg może być, i nie skacz bez powodu.",
      measure: "Po każdej rundzie oceń: czy twój bieg zdradził pozycję? Cel: 0 takich rund na 10.",
    },
    en: {
      name: "Retake/DM: quiet on contact",
      how: "On a retake server, walk with Shift for the last meters before a spot where an enemy may be, and don't jump without a reason.",
      measure: "After each round ask: did my running give away my position? Target: 0 such rounds out of 10.",
    },
  },
  nade_practice: {
    id: "nade_practice",
    where: "server",
    minutes: 15,
    types: ["he_no_effect", "molotov_no_effect", "nade_team_damage", "death_with_utility", "smoke_early"],
    pl: {
      name: "Prywatny serwer: granaty",
      how: "sv_cheats 1, sv_infinite_ammo 1, sv_grenade_trajectory_prac_pipreview 1. Ćwicz molotovy i HE na typowe pozycje twojej mapy i kiedy je rzucać.",
      measure: "5 powtórzeń każdego rzutu, aż 4 z 5 lądują w tym samym miejscu.",
    },
    en: {
      name: "Private server: grenades",
      how: "sv_cheats 1, sv_infinite_ammo 1, sv_grenade_trajectory_prac_pipreview 1. Practise molotovs and HEs into common spots of your map and when to throw them.",
      measure: "5 repetitions of each throw, until 4 out of 5 land in the same spot.",
    },
  },
  lineups: {
    id: "lineups",
    where: "app",
    appPath: "/lineups",
    minutes: 15,
    types: ["smoke_early", "smoke_void", "lineup_miss"],
    pl: {
      name: "Lineupy z bazy",
      how: "Otwórz Lineupy, wybierz 3 smoke'i swojej mapy, skopiuj setpos/setang i rzuć każdy na prywatnym serwerze.",
      measure: "Każdy smoke 5 razy z rzędu w to samo miejsce bez podglądu trajektorii.",
    },
    en: {
      name: "Lineups from the base",
      how: "Open Lineups, pick 3 smokes for your map, copy setpos/setang and throw each one on a private server.",
      measure: "Each smoke 5 times in a row in the same spot without the trajectory preview.",
    },
  },
  flash_practice: {
    id: "flash_practice",
    where: "server",
    minutes: 10,
    types: ["flash_blind", "team_flash", "flash_no_peek"],
    pl: {
      name: "Pop-flashe z kolegą",
      how: "Na prywatnym serwerze z bot_stop 1: flash zza ściany, który wybucha zaraz po wyjściu zza rogu, i od razu wejście. Z kolegą ćwiczcie zapowiedź „flash, idź”.",
      measure: "Z pozycji bota widzisz biały ekran ponad sekundę, a ty sam nie jesteś oślepiony.",
    },
    en: {
      name: "Pop-flashes with a friend",
      how: "Private server with bot_stop 1: a flash from behind the wall that pops right as it clears the corner, then peek immediately. With a friend, practise calling \"flash, go\".",
      measure: "From the bot's position the screen stays white for over a second, and you are not blinded yourself.",
    },
  },
  retake_servers: {
    id: "retake_servers",
    where: "server",
    minutes: 20,
    types: ["retake_solo", "postplant_death", "clutch_decision", "early_rotation"],
    pl: {
      name: "Serwery retake",
      how: "Graj retake'i i świadomie wybieraj: czekać na kolegę, grać czas, czy iść sam. Na post-plancie trzymaj kąt na bombę zamiast szukać fragów.",
      measure: "Policz rundy, w których wszedłeś sam na 2+ wrogów; cel: najwyżej 1 na 10.",
    },
    en: {
      name: "Retake servers",
      how: "Play retakes and choose deliberately: wait for a teammate, play the clock, or go alone. Post-plant, hold an angle on the bomb instead of hunting frags.",
      measure: "Count rounds where you went alone into 2+ enemies; target: at most 1 out of 10.",
    },
  },
  trade_review: {
    id: "trade_review",
    where: "app",
    appPath: "/replay",
    minutes: 15,
    types: ["untraded_death", "missed_trade", "entry_death", "lurk_death"],
    pl: {
      name: "Przegląd trade'ów w replayu 2D",
      how: "Obejrzyj w replayu 2D momenty z planu: gdzie był najbliższy kolega, kiedy mógł cię odegrać i jak musiałbyś stać, żeby mógł.",
      measure: "Do każdego momentu zapisz jedną zmianę pozycji lub czasu wejścia.",
    },
    en: {
      name: "Trade review in the 2D replay",
      how: "Watch the plan's moments in the 2D replay: where the nearest teammate was, when they could have traded you and where you would have had to stand for that.",
      measure: "For each moment, write down one change of position or timing.",
    },
  },
  position_review: {
    id: "position_review",
    where: "app",
    appPath: "/heatmaps",
    minutes: 10,
    types: ["predictable_position", "early_rotation", "clutch_decision", "isolated_aggression"],
    pl: {
      name: "Heatmapa i pozycje",
      how: "Sprawdź heatmapę swoich pozycji CT i przygotuj 2–3 warianty na każdą stronę bombsite'u, które zmieniasz co kilka rund.",
      measure: "W następnym meczu ta sama pozycja najwyżej w co drugiej rundzie CT.",
    },
    en: {
      name: "Heatmap and positions",
      how: "Check the heatmap of your CT positions and prepare 2–3 variants per bombsite that you switch every few rounds.",
      measure: "Next match: the same position in at most every other CT round.",
    },
  },
  economy_review: {
    id: "economy_review",
    where: "app",
    appPath: "/economy",
    minutes: 10,
    types: ["bad_force", "no_drop", "death_with_money"],
    pl: {
      name: "Ekonomia przed zakupem",
      how: "Przejrzyj ekonomię ostatniego meczu i przed każdym zakupem w grze policz: ile będzie miał team w następnej rundzie, jeśli tę przegra.",
      measure: "W następnym meczu 0 force'ów, po których team nie może kupić pełnego ekwipunku.",
    },
    en: {
      name: "Economy before the buy",
      how: "Review the economy of your last match and before every buy in game count: how much the team will have next round if this one is lost.",
      measure: "Next match: 0 force buys after which the team can't afford a full buy.",
    },
  },
};

export const DRILL_IDS = Object.keys(DRILLS) as DrillId[];

/** Drills that train a finding type, best match first (fewest other types). */
export function drillsFor(type: string): DrillDef[] {
  return Object.values(DRILLS)
    .filter((d) => (d.types as string[]).includes(type))
    .sort((a, b) => (a.types as string[]).indexOf(type) - (b.types as string[]).indexOf(type) || a.types.length - b.types.length);
}

/** Localised text with "{map}" filled in (or dropped when the map is unknown). */
export function drillText(id: DrillId, locale: Locale, mapName: string | null): DrillText & { workshop?: string } {
  const d = DRILLS[id];
  const fill = (s: string) => (mapName ? s.replace(/\{map\}/g, mapName) : s.replace(/\s*\{map\}\s*/g, " ").trim());
  const text = d[locale] ?? d.pl;
  return {
    name: fill(text.name),
    how: fill(text.how),
    measure: fill(text.measure),
    workshop: d.workshop ? fill(d.workshop) : undefined,
  };
}

/** Steam Workshop search for the map (stable; item ids are never guessed). */
export function workshopUrl(name: string): string {
  return `https://steamcommunity.com/workshop/browse/?appid=730&searchtext=${encodeURIComponent(name)}`;
}
