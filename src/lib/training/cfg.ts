/**
 * Downloadable CS2 configs (S22): the grenade practice config (private
 * server settings + one alias per lineup) and the daily routine config (the
 * day's plan printed in the console + the same helper aliases). Pure, so the
 * exact file is covered by `npm run test:training`.
 *
 * Rules that keep a .cfg safe to exec:
 * - nothing is bound to a key (the player's own binds stay untouched),
 * - every alias is prefixed `cs2a_` so it can't shadow the player's aliases,
 * - echo/comment text is plain ASCII without quotes or semicolons (the console
 *   would split the line there).
 */
import { lineupName, setposCommand, type Lineup } from "@/lib/analysis/lineups";
import type { ThrowTechnique } from "@/lib/analysis/utility";
import type { Locale } from "@/lib/i18n/config";
import type { Routine } from "./routine";

/** Private server for grenade practice (the S22 trio plus a round that never ends). */
export const PRACTICE_SETTINGS = [
  "sv_cheats 1",
  "mp_warmup_end",
  "bot_kick",
  "mp_limitteams 0",
  "mp_autoteambalance 0",
  "mp_freezetime 0",
  "mp_roundtime 60",
  "mp_roundtime_defuse 60",
  "mp_roundtime_hostage 60",
  "mp_buy_anywhere 1",
  "mp_buytime 9999",
  "mp_startmoney 60000",
  "mp_maxmoney 60000",
  "sv_infinite_ammo 1",
  "ammo_grenade_limit_total 5",
  "sv_grenade_trajectory_prac_pipreview 1",
  "sv_showimpacts 1",
  "mp_restartgame 1",
] as const;

/** At most this many lineups get an alias (cs2a_1 … cs2a_12). */
export const MAX_CFG_LINEUPS = 12;

const FOLD: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "A", Ć: "C", Ę: "E", Ł: "L", Ń: "N", Ó: "O", Ś: "S", Ź: "Z", Ż: "Z",
  "–": "-", "—": "-", "→": "->", "≤": "<=", "≥": ">=", "·": "-", "„": "", "”": "", "“": "", "’": "'", "…": "...",
};

/** Text that is safe inside `echo "…"` and `// …`: ASCII, no quotes, no semicolons, one line. */
export function cfgText(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7e]/g, (c) => FOLD[c] ?? (c.normalize("NFD").replace(/[^\x20-\x7e]/g, "") || ""))
    .replace(/["`]/g, "'")
    .replace(/;/g, ",")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** File name the browser saves: `cs2a_lineups_mirage.cfg`. Lowercase ASCII only. */
export function cfgFileName(kind: "lineups" | "routine", suffix?: string | null): string {
  const tail = suffix ? `_${suffix.replace(/^de_/, "").toLowerCase().replace(/[^a-z0-9]+/g, "")}` : "";
  return `cs2a_${kind}${tail}.cfg`;
}

/** Name used with `exec` (the file name without .cfg). */
export const execName = (file: string) => file.replace(/\.cfg$/, "");

const COPY = {
  pl: {
    lineupsTitle: "CS2 Analyst - trener lineupow",
    routineTitle: "CS2 Analyst - rutyna dnia",
    save: "Zapisz plik w folderze game/csgo/cfg w katalogu Counter-Strike 2.",
    lineupsRun: "Uruchom mape (konsola: map {map}), potem: exec {exec}",
    routineRun: "Wpisz w konsoli: exec {exec} - wypisze rutyne i doda skroty do cwiczen.",
    noBinds: "Plik nie zmienia zadnych bindow klawiszy.",
    aliasLineup: "cs2a_{n} = ustaw sie na lineupie {n}",
    aliasRethrow: "cs2a_rethrow = powtorz ostatni granat",
    aliasNoclip: "cs2a_fly = noclip wl/wyl",
    aliasHelp: "cs2a_help = ta lista",
    aliasPractice: "cs2a_practice = ustawienia serwera do granatow (sv_cheats 1, nieskonczona amunicja, podglad trajektorii)",
    aliasShowpos: "cs2a_speed = predkosc na ekranie (cl_showpos) do counter-strafe",
    lineups: "Lineupy",
    technique: { stand: "z miejsca", walk: "w chodzie", run: "w biegu", jump: "z wyskoku (jumpthrow)" } as Record<ThrowTechnique, string>,
    routine: "Plan na dzis",
    total: "Razem",
    target: "cel",
    workshop: "Workshop",
    min: "min",
    none: "Brak lineupow - wgraj wiecej dem z tej mapy.",
  },
  en: {
    lineupsTitle: "CS2 Analyst - lineup trainer",
    routineTitle: "CS2 Analyst - daily routine",
    save: "Save the file in the game/csgo/cfg folder of your Counter-Strike 2 install.",
    lineupsRun: "Start the map (console: map {map}), then: exec {exec}",
    routineRun: "Type in the console: exec {exec} - it prints the routine and adds practice shortcuts.",
    noBinds: "The file changes no key binds.",
    aliasLineup: "cs2a_{n} = go to lineup {n}",
    aliasRethrow: "cs2a_rethrow = rethrow the last grenade",
    aliasNoclip: "cs2a_fly = noclip on/off",
    aliasHelp: "cs2a_help = this list",
    aliasPractice: "cs2a_practice = grenade practice server settings (sv_cheats 1, infinite ammo, trajectory preview)",
    aliasShowpos: "cs2a_speed = velocity on screen (cl_showpos) for counter-strafing",
    lineups: "Lineups",
    technique: { stand: "standing", walk: "walking", run: "running", jump: "jump throw" } as Record<ThrowTechnique, string>,
    routine: "Today's plan",
    total: "Total",
    target: "target",
    workshop: "Workshop",
    min: "min",
    none: "No lineups yet - upload more demos of this map.",
  },
} as const;

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

type CfgLineup = Pick<Lineup, "type" | "technique" | "landPlace" | "throwPlace" | "x" | "y" | "z" | "pitch" | "yaw">;

function lineupBlock(lineups: CfgLineup[], c: (typeof COPY)[Locale]): { aliases: string[]; help: string[] } {
  const list = lineups.slice(0, MAX_CFG_LINEUPS);
  const aliases = list.map((l, i) => `alias cs2a_${i + 1} "${setposCommand(l)}"`);
  const help = list.map(
    (l, i) => `${fill(c.aliasLineup, { n: i + 1 })}: ${cfgText(lineupName(l, i))}, ${c.technique[l.technique]}`
  );
  return { aliases, help };
}

/** Printed on exec, one `echo` per line (an alias holding them all would hit the console's line limit). */
const echoLines = (lines: string[]) => lines.map((l) => `echo "${cfgText(l)}"`);

/** `cs2a_help`: the shortcuts only, short enough for one alias. */
function helpAlias(lines: string[]): string {
  return `alias cs2a_help "${lines.map((l) => `echo ${cfgText(l)}`).join(";")}"`;
}

const header = (title: string, lines: string[]) => [`// ${cfgText(title)}`, ...lines.map((l) => `// ${cfgText(l)}`), ""];

/** Grenade practice config for one map: server settings run on exec, one alias per lineup. */
export function lineupPracticeCfg(o: { map: string; mapName: string; lineups: CfgLineup[]; locale: Locale; date: string }): string {
  const c = COPY[o.locale] ?? COPY.pl;
  const file = cfgFileName("lineups", o.map);
  const { aliases, help } = lineupBlock(o.lineups, c);
  const shortcuts = [c.aliasRethrow, c.aliasNoclip, c.aliasHelp];
  const printed = [`${c.lineups} ${o.mapName}:`, ...(help.length > 0 ? help : [c.none]), ...shortcuts];
  return [
    ...header(`${c.lineupsTitle} - ${o.mapName} - ${o.date}`, [c.save, fill(c.lineupsRun, { map: o.map, exec: execName(file) }), c.noBinds]),
    ...PRACTICE_SETTINGS,
    "",
    ...aliases,
    `alias cs2a_rethrow "sv_rethrow_last_grenade"`,
    `alias cs2a_fly "noclip"`,
    helpAlias([`${c.lineups}: cs2a_1 - cs2a_${Math.max(1, aliases.length)}`, ...shortcuts]),
    "",
    ...echoLines(printed),
    "",
  ].join("\n");
}

/** Daily routine config: prints the day in the console and defines the practice shortcuts. */
export function routineCfg(o: {
  routine: Routine;
  dayName: string;
  date: string;
  mapName: string | null;
  lineups: CfgLineup[];
  locale: Locale;
}): string {
  const c = COPY[o.locale] ?? COPY.pl;
  const file = cfgFileName("routine");
  const { aliases, help } = lineupBlock(o.lineups, c);
  const plan = o.routine.items.map((item, i) => {
    const where = item.workshop ? ` (${c.workshop}: ${item.workshop})` : "";
    return `${i + 1}. ${item.name}${where} - ${item.minutes} ${c.min} - ${c.target}: ${item.target}`;
  });
  const shooting = o.routine.items.some((i) => i.drill === "aim_botz_strafe");
  const shortcuts = [
    c.aliasPractice,
    ...(shooting ? [c.aliasShowpos] : []),
    ...(aliases.length > 0 ? [`${c.lineups}: cs2a_1 - cs2a_${aliases.length}`] : []),
    c.aliasRethrow,
    c.aliasNoclip,
    c.aliasHelp,
  ];
  const printed = [
    `${c.routine} - ${o.dayName} ${o.date} - ${c.total} ${o.routine.minutes} ${c.min}:`,
    ...plan,
    ...(help.length > 0 ? [`${c.lineups}${o.mapName ? ` ${o.mapName}` : ""}:`, ...help] : []),
    ...shortcuts,
  ];
  return [
    ...header(`${c.routineTitle} - ${o.dayName} ${o.date}`, [c.save, fill(c.routineRun, { exec: execName(file) }), c.noBinds, "", ...plan]),
    `alias cs2a_practice "${PRACTICE_SETTINGS.join(";")}"`,
    ...(shooting ? [`alias cs2a_speed "cl_showpos 1"`] : []),
    `alias cs2a_rethrow "sv_rethrow_last_grenade"`,
    `alias cs2a_fly "noclip"`,
    ...aliases,
    helpAlias(shortcuts),
    "",
    ...echoLines(printed),
    "",
  ].join("\n");
}
