/**
 * The bot's slash commands (S26), in the shape Discord's bulk overwrite
 * (`PUT /applications/<id>/commands`) takes. Names and descriptions default
 * to Polish with English localisations; Discord shows the one matching the
 * player's client language.
 */

export const COMMAND = {
  stats: "stats",
  lastMatch: "ostatni-mecz",
  link: "polacz",
  unlink: "rozlacz",
} as const;

export const STATS_DEFAULT_MATCHES = 10;
export const STATS_MAX_MATCHES = 50;

/** ApplicationCommandOptionType */
const OPTION_STRING = 3;
const OPTION_INTEGER = 4;

const EN = (s: string) => ({ "en-US": s, "en-GB": s });

export interface CommandDefinition {
  name: string;
  name_localizations?: Record<string, string>;
  description: string;
  description_localizations?: Record<string, string>;
  /** 0 guild, 1 user install. */
  integration_types: number[];
  /** 0 guild, 1 bot DM, 2 private channel. */
  contexts: number[];
  options?: Array<{
    type: number;
    name: string;
    name_localizations?: Record<string, string>;
    description: string;
    description_localizations?: Record<string, string>;
    required?: boolean;
    min_value?: number;
    max_value?: number;
    min_length?: number;
    max_length?: number;
  }>;
}

const EVERYWHERE = { integration_types: [0, 1], contexts: [0, 1, 2] };

export const COMMANDS: CommandDefinition[] = [
  {
    name: COMMAND.stats,
    description: "Twoje statystyki z ostatnich analizowanych meczów",
    description_localizations: EN("Your stats from your latest analysed matches"),
    ...EVERYWHERE,
    options: [
      {
        type: OPTION_INTEGER,
        name: "mecze",
        name_localizations: EN("matches"),
        description: `Ile ostatnich meczów (domyślnie ${STATS_DEFAULT_MATCHES})`,
        description_localizations: EN(`How many recent matches (default ${STATS_DEFAULT_MATCHES})`),
        min_value: 1,
        max_value: STATS_MAX_MATCHES,
      },
    ],
  },
  {
    name: COMMAND.lastMatch,
    name_localizations: EN("last-match"),
    description: "Ostatni przeanalizowany mecz: wynik, statystyki, co poprawić i link do raportu",
    description_localizations: EN("Your latest analysed match: score, stats, what to improve and the report link"),
    ...EVERYWHERE,
  },
  {
    name: COMMAND.link,
    name_localizations: EN("link"),
    description: "Połącz Discord z kontem CS2 Analyst kodem z Ustawień",
    description_localizations: EN("Link Discord to your CS2 Analyst account with the code from Settings"),
    ...EVERYWHERE,
    options: [
      {
        type: OPTION_STRING,
        name: "kod",
        name_localizations: EN("code"),
        description: "Kod z Ustawienia → Discord",
        description_localizations: EN("The code from Settings → Discord"),
        required: true,
        min_length: 8,
        max_length: 12,
      },
    ],
  },
  {
    name: COMMAND.unlink,
    name_localizations: EN("unlink"),
    description: "Odłącz Discord od konta CS2 Analyst",
    description_localizations: EN("Unlink Discord from your CS2 Analyst account"),
    ...EVERYWHERE,
  },
];
