/**
 * Finding catalog: every kind of mistake the analysis can report, grouped into
 * report categories, with the one piece of advice, a drill and a pro reference.
 *
 * Extending (S11 utility, S12 team/economy/positions): add the type here, write
 * a pure detector that returns `FindingDraft`s (see detect.ts), call it from
 * `detectFindings`, and — if the type has a headline number — add a metric in
 * report.ts. The report, the replay markers and the finding cards pick new
 * types up from this table; no UI change is needed.
 *
 * Pro values are reference points from public pro/FPL averages until S13
 * replaces them with norms measured on pro demos.
 */

export type FindingCategory =
  | "shooting"
  | "aim"
  | "duels"
  | "sound"
  | "utility"
  | "teamplay"
  | "economy"
  | "positioning";

export type FindingSeverity = "high" | "medium" | "low";

export interface CategoryDef {
  key: FindingCategory;
  label: string;
  description: string;
  /** Session that brings this category's detectors, while it has none yet. */
  plannedIn?: string;
}

export const CATEGORIES: CategoryDef[] = [
  { key: "shooting", label: "Strzelanie", description: "Ruch przy strzale, counter-strafe, pierwsza kula i spray." },
  { key: "aim", label: "Celowanie", description: "Crosshair placement, reakcja, flicki i trafienia w głowę." },
  { key: "duels", label: "Pojedynki i peeki", description: "Jak wchodzisz w walkę: peeki, flashe od teamu, przeładowania." },
  { key: "sound", label: "Ruch i dźwięk", description: "Kroki i skoki, które zdradzają twoją pozycję." },
  { key: "utility", label: "Utility", description: "Smoke'i, flashe, molotovy i HE: czas, miejsce, efekt.", plannedIn: "S11" },
  { key: "teamplay", label: "Gra zespołowa", description: "Trade'y, rotacje, entry, post-plant i retake.", plannedIn: "S12" },
  { key: "economy", label: "Ekonomia", description: "Force buy, dropy, śmierć z dużą kasą.", plannedIn: "S12" },
  { key: "positioning", label: "Pozycje", description: "Przewidywalne pozycje i decyzje w clutchu.", plannedIn: "S12" },
];

export const categoryDef = (key: string): CategoryDef =>
  CATEGORIES.find((c) => c.key === key) ?? { key: key as FindingCategory, label: key, description: "" };

export interface FindingTypeDef {
  category: FindingCategory;
  /** One moment, as a tag ("Strzał w ruchu"). */
  label: string;
  /** The issue as a report heading, addressed to the player. */
  title: string;
  /** Why it costs rounds, one sentence. */
  why: string;
  /** The one piece of advice. */
  advice: string;
  /** A concrete exercise. */
  drill: string;
  /** Reference pro value (until S13 norms). */
  pro: string;
  /** Impact on rounds, used to rank issues (1 = normal). */
  weight: number;
  /** Clip shown on the finding card, seconds around the moment. */
  clip: { before: number; after: number };
  /** Metric-only type: no single moments, only the match number. */
  metricOnly?: boolean;
}

const DUEL_CLIP = { before: 3, after: 1.5 };

export const FINDING_TYPES = {
  // ─── Strzelanie (S8) ───
  moving_shot: {
    category: "shooting",
    label: "Strzał w ruchu",
    title: "Strzelasz w ruchu",
    why: "Powyżej 34% maksymalnej prędkości broni CS2 dodaje rozrzut, więc pierwsza kula leci obok głowy.",
    advice: "Zanim klikniesz, zatrzymaj się: puść klawisz ruchu i stuknij przeciwny (counter-strafe), dopiero potem strzał.",
    drill: "Mapa Aim Botz: strafe A-D i strzał dopiero po zatrzymaniu, 5 minut przed każdą grą.",
    pro: "pro: ok. 5–8% pierwszych strzałów w ruchu",
    weight: 1.3,
    clip: DUEL_CLIP,
  },
  late_strafe: {
    category: "shooting",
    label: "Strzał w trakcie hamowania",
    title: "Strzelasz, zanim skończysz hamować",
    why: "Strzał w trakcie counter-strafe'u leci jeszcze z rozrzutem ruchu, choć wydaje się, że już stoisz.",
    advice: "Hamuj wcześniej: zacznij counter-strafe, gdy widzisz krawędź ściany, nie dopiero wroga.",
    drill: "Prefire maps (np. Yprac): wychodź zza rogu z counter-strafe'em, strzał dopiero przy zerowej prędkości (cl_showpos 1).",
    pro: "pro: zatrzymanie w ok. 80–100 ms",
    weight: 1.1,
    clip: DUEL_CLIP,
  },
  first_bullet: {
    category: "shooting",
    label: "Celność 1. kuli",
    title: "Pierwsza kula rzadko trafia",
    why: "Większość pojedynków rozstrzyga pierwsze trafienie, a seria po pudle pierwszej kuli trafia dużo rzadziej.",
    advice: "Postaw celownik na wysokości głowy i strzelaj pierwszą kulą z miejsca, zamiast od razu sprayować.",
    drill: "Aim Botz: 100 zabójstw jedną kulą (tapping) z AK, bez ruchu, potem z counter-strafe'em.",
    pro: "pro: ok. 35–45% trafień pierwszą kulą",
    weight: 1.2,
    clip: DUEL_CLIP,
    metricOnly: true,
  },
  spray: {
    category: "shooting",
    label: "Spray w próżnię",
    title: "Spray się rozjeżdża",
    why: "Kule od czwartej lecą już według wzoru odrzutu; bez kontroli dalsza seria nie trafia.",
    advice: "Na dystansie strzelaj seriami 3–5 kul zamiast pełnego sprayu, a pełny spray ćwicz na ścianie.",
    drill: "Recoil Master / ściana na Aim Botz: wzór AK i M4 po 10 serii dziennie.",
    pro: "pro: ok. 35% trafień od 4. kuli",
    weight: 0.9,
    clip: { before: 1, after: 2 },
  },
  air_shot: {
    category: "shooting",
    label: "Strzał w powietrzu",
    title: "Strzelasz w powietrzu",
    why: "W powietrzu każda broń poza SSG w szczycie skoku ma ogromny rozrzut.",
    advice: "Nie strzelaj w trakcie skoku; wyląduj, zatrzymaj się i dopiero strzelaj.",
    drill: "Na rozgrzewce skacz przez przeszkodę i strzelaj dopiero po wylądowaniu i zatrzymaniu.",
    pro: "pro: prawie 0 strzałów w powietrzu poza SSG",
    weight: 0.5,
    clip: { before: 1, after: 1.5 },
  },

  // ─── Celowanie (S9) ───
  crosshair: {
    category: "aim",
    label: "Crosshair placement",
    title: "Celownik nie czeka na głowę wroga",
    why: "Gdy celownik stoi daleko od miejsca, w którym pojawi się wróg, musisz zrobić duży ruch myszką i przegrywasz czas.",
    advice: "Trzymaj celownik na wysokości głowy i przy krawędzi, zza której może wyjść wróg; nie celuj w ściany ani w podłogę.",
    drill: "Na pustym serwerze przejdź trasy swojej strony i na każdym rogu ustaw celownik na wysokości głowy.",
    pro: "pro: ok. 3–5° od głowy przy pojawieniu się wroga",
    weight: 1.3,
    clip: DUEL_CLIP,
  },
  reaction: {
    category: "aim",
    label: "Wolna reakcja",
    title: "Reagujesz za wolno",
    why: "Wróg, który widzi cię tyle samo czasu, strzela pierwszy, jeśli reakcja trwa dłużej niż 300–400 ms.",
    advice: "Graj pozycje, na których spodziewasz się wroga z jednego kierunku, żeby reagować, a nie szukać.",
    drill: "Aim Lab / KovaaK's: Reflex Shot lub Spidershot, 10 minut dziennie.",
    pro: "pro: ok. 200–250 ms",
    weight: 1.1,
    clip: DUEL_CLIP,
  },
  ttd: {
    category: "aim",
    label: "Time to damage",
    title: "Za długo do pierwszego trafienia",
    why: "Czas od zobaczenia wroga do zadania mu obrażeń decyduje o tym, kto wygrywa pojedynek.",
    advice: "Poprawiaj crosshair placement i zatrzymanie przed strzałem; to one skracają czas do trafienia.",
    drill: "Aim Botz: boty wychodzące zza rogu, mierz czas do pierwszego trafienia.",
    pro: "pro: ok. 350–450 ms",
    weight: 1,
    clip: DUEL_CLIP,
    metricOnly: true,
  },
  overflick: {
    category: "aim",
    label: "Overflick",
    title: "Przestrzeliwujesz flicki",
    why: "Flick, który mija głowę, wymaga drugiej poprawki i daje wrogowi czas na strzał.",
    advice: "Obniż czułość albo celuj bliżej wroga przed peekiem, żeby flick był krótszy.",
    drill: "KovaaK's / Aim Lab: ćwiczenia flick z małymi celami, nacisk na zatrzymanie na celu, nie na szybkość.",
    pro: "pro: ok. 10% flicków przestrzelonych",
    weight: 0.8,
    clip: DUEL_CLIP,
  },
  headshots: {
    category: "aim",
    label: "Trafienia w głowę",
    title: "Mało trafień w głowę",
    why: "Trafienie w głowę z karabinu zabija od razu, w ciało potrzebujesz 3–4 kul.",
    advice: "Prowadź celownik na wysokości głowy, a nie ciała, także podczas ruchu po mapie.",
    drill: "Aim Botz z trybem tylko headshoty (mp_damage_headshot_only 1), 100 zabójstw.",
    pro: "pro: ok. 45–55% trafień w głowę",
    weight: 0.9,
    clip: DUEL_CLIP,
    metricOnly: true,
  },
  preaim: {
    category: "aim",
    label: "Pre-aim",
    title: "Mało trafień z pre-aimu",
    why: "Trafienie bez dużej korekty to najszybsze trafienie; wymaga dobrego przewidywania pozycji wroga.",
    advice: "Ucz się typowych pozycji wrogów na mapie i peekuj z celownikiem już na nich.",
    drill: "Prefire maps (Yprac) na twoich mapach, wszystkie pozycje po kolei.",
    pro: "pro: ok. 40–50% trafień z pre-aimu",
    weight: 0.7,
    clip: DUEL_CLIP,
    metricOnly: true,
  },

  // ─── Pojedynki i peeki (S9) ───
  dry_peek: {
    category: "duels",
    label: "Suchy peek",
    title: "Peekujesz na sucho i przegrywasz",
    why: "Peek bez flasha ani trade'u daje wrogowi czysty strzał do ciebie, a gdy zginiesz, team traci gracza za darmo.",
    advice: "Przed peekiem na znaną pozycję poproś o flash albo idź tak, żeby kolega mógł cię odegrać (trade).",
    drill: "Naucz się 2–3 pop-flashy dla siebie na każdej mapie (Yprac / lineup'y na YouTube).",
    pro: "pro: ok. 35% przegranych suchych peeków",
    weight: 1.2,
    clip: DUEL_CLIP,
  },
  reload: {
    category: "duels",
    label: "Reload w złym momencie",
    title: "Przeładowujesz przy wrogu",
    why: "Przez ok. 2,5 s przeładowania nie możesz strzelić, a znany wróg może w tym czasie wyjść.",
    advice: "Przeładowuj schowany za ścianą albo dopiero, gdy w magazynku zostało mało; przy wrogu dobij pistoletem.",
    drill: "Po każdym zabójstwie na DM: najpierw schowaj się, dopiero potem przeładuj.",
    pro: "pro: 0–1 takich przeładowań na mecz",
    weight: 1,
    clip: { before: 1.5, after: 3 },
  },

  // ─── Ruch i dźwięk (S9) ───
  noise: {
    category: "sound",
    label: "Bieg przy wrogu",
    title: "Biegasz przy wrogu i zdradzasz pozycję",
    why: "Kroki słychać z ok. 1100 jednostek; wróg wie, gdzie jesteś, i czeka z celownikiem.",
    advice: "W zasięgu słuchu znanego wroga idź na Shift; biegnij tylko, gdy i tak cię widzi albo walczy kolega.",
    drill: "W meczu: zanim wyjdziesz z przejścia przy znanym wrogu, przełącz się na chód.",
    pro: "pro: 0–2 takie biegi na mecz",
    weight: 0.9,
    clip: { before: 1, after: 3 },
  },
  jump: {
    category: "sound",
    label: "Zbędny skok",
    title: "Skaczesz przy wrogu",
    why: "Lądowanie po skoku słychać, a w powietrzu nie trafisz.",
    advice: "Przy wrogu skacz tylko po to, żeby wejść na murek lub zebrać info jump-peekiem, nigdy przed walką.",
    drill: "Naucz się jump-peeków na 2–3 kąty AWP na twoich mapach, zamiast zwykłych skoków.",
    pro: "pro: 0–1 zbędny skok na mecz",
    weight: 0.7,
    clip: { before: 1, after: 2 },
  },
} satisfies Record<string, FindingTypeDef>;

export type FindingType = keyof typeof FINDING_TYPES;

export const FINDING_TYPE_KEYS = Object.keys(FINDING_TYPES) as FindingType[];

export function isFindingType(t: string): t is FindingType {
  return t in FINDING_TYPES;
}

/** Definition for a stored type; unknown types (newer code, older reader) get a neutral fallback. */
export function findingDef(type: string): FindingTypeDef {
  if (isFindingType(type)) return FINDING_TYPES[type];
  return {
    category: "aim",
    label: type,
    title: type,
    why: "",
    advice: "",
    drill: "",
    pro: "",
    weight: 1,
    clip: DUEL_CLIP,
  };
}

export const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  high: "Poważny błąd",
  medium: "Do poprawy",
  low: "Wskazówka",
};
