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
  { key: "teamplay", label: "Gra zespołowa", description: "Trade'y, rotacje, entry, lurk, post-plant i retake." },
  { key: "economy", label: "Ekonomia", description: "Force buy, dropy, śmierć z dużą kasą." },
  { key: "positioning", label: "Pozycje", description: "Przewidywalne pozycje i decyzje w clutchu." },
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
  // ─── Gra zespołowa (S12) ───
  untraded_death: {
    category: "teamplay",
    label: "Śmierć bez trade'u",
    title: "Giniesz tam, gdzie nikt cię nie odegra",
    why: "Śmierć bez kolegi w zasięgu trade'u to czysta strata: wróg nic nie oddaje, a team gra w osłabieniu.",
    advice: "Graj w zasięgu kolegi (do ok. 3 s biegu) albo nie bierz pojedynku sam; najpierw info, potem walka razem.",
    drill: "W kolejnym meczu przed każdym peekiem sprawdź na radarze, czy ktoś jest w zasięgu trade'u.",
    pro: "pro: ok. 1–2 śmierci w izolacji na mecz",
    weight: 1.2,
    clip: { before: 5, after: 2 },
  },
  missed_trade: {
    category: "teamplay",
    label: "Brak trade'u kolegi",
    title: "Nie odgrywasz kolegów",
    why: "Wróg, który właśnie zabił, stoi w znanym miejscu i często przeładowuje; to najłatwiejszy frag w rundzie.",
    advice: "Gdy kolega ginie obok, od razu wychodź na jego zabójcę (najlepiej z innego kąta), zanim ten zmieni pozycję.",
    drill: "Retake/DM w parach: jeden peekuje, drugi trzyma się 1–2 m za nim i odgrywa w ciągu 2 s.",
    pro: "pro: ok. 60–70% szans na trade wykorzystanych",
    weight: 1.2,
    clip: { before: 2, after: 4 },
  },
  entry_death: {
    category: "teamplay",
    label: "Entry bez wsparcia",
    title: "Wchodzisz pierwszy bez wsparcia",
    why: "Entry ma sens tylko wtedy, gdy ktoś zaraz odda frag; samotna pierwsza śmierć zostawia team w 4v5.",
    advice: "Wchodź na bombsite z kolegą tuż za tobą i z flashem; jeśli nikt nie idzie, poczekaj na drużynę.",
    drill: "Ustal z teamem 1 wejście na mapę: kto flashuje, kto wchodzi pierwszy, kto odgrywa.",
    pro: "pro: ok. 50% wygranych otwarć, przegrane zwykle z trade'em",
    weight: 1.3,
    clip: { before: 5, after: 2 },
  },
  lurk_death: {
    category: "teamplay",
    label: "Lurk bez wpływu",
    title: "Lurkujesz i giniesz bez efektu",
    why: "Lurker daje drużynie info i odcina rotacje; śmierć z daleka od teamu przed plantem nie daje nic i osłabia wejście.",
    advice: "Na lurku zbieraj info i czekaj na ruch teamu; walkę bierz w momencie wejścia drużyny albo z pleców rotujących CT.",
    drill: "Przejrzyj w replayu 3 rundy lurku: gdzie był team, kiedy zginąłeś, kiedy rotowali CT.",
    pro: "pro: lurker rzadko ginie przed plantem bez fragu",
    weight: 1,
    clip: { before: 5, after: 2 },
  },
  early_rotation: {
    category: "teamplay",
    label: "Za wczesna rotacja",
    title: "Rotujesz za wcześnie",
    why: "Rotacja na fejk zostawia twój bombsite pusty; T podkładają bez walki i retake jest dużo trudniejszy.",
    advice: "Schodź z bombsite'u dopiero po potwierdzonym info (3+ wrogów, bomba, call kolegi), a nie na sam dźwięk.",
    drill: "Na swoich pozycjach CT ustal z teamem, przy jakim info rotujesz, i trzymaj się tego przez cały mecz.",
    pro: "pro: rotacja po potwierdzeniu 3+ wrogów lub bomby",
    weight: 1.1,
    clip: { before: 3, after: 6 },
  },
  postplant_death: {
    category: "teamplay",
    label: "Walka po plancie",
    title: "Po plancie szukasz fragów zamiast grać na czas",
    why: "Po plancie czas gra dla T: każda zbędna walka daje CT szansę na retake w przewadze.",
    advice: "Po plancie zajmij pozycję na krzyżowy ogień na bombę i czekaj, aż CT muszą przyjść; nie peekuj pierwszy.",
    drill: "Na każdej mapie naucz się 2 pozycji post-plant na bombsite A i B.",
    pro: "pro: ok. 70% wygranych rund po plancie",
    weight: 1,
    clip: { before: 4, after: 2 },
  },
  retake_solo: {
    category: "teamplay",
    label: "Samotny retake",
    title: "Idziesz na retake sam",
    why: "Na retake'u T czekają w przygotowanych pozycjach; gracz wchodzący sam ginie i zostawia team w gorszej liczbie.",
    advice: "Zbierz się z kolegami przed wejściem i wchodźcie razem z utility, z różnych stron, w tym samym momencie.",
    drill: "Serwer retake'ów (Retakes) na twoich mapach, 15 minut z naciskiem na wspólne wejście.",
    pro: "pro: retake'i zaczynają razem 2+ graczy z utility",
    weight: 1,
    clip: { before: 5, after: 2 },
  },

  // ─── Ekonomia (S12) ───
  bad_force: {
    category: "economy",
    label: "Force w złym momencie",
    title: "Force buy kosztuje was pełny zakup",
    why: "Przegrany force zabiera pieniądze, które przy save dałyby pełny zakup w następnej rundzie.",
    advice: "Forsuj tylko w rundach, które muszą być wygrane (ostatnia połowy, match point) albo gdy po save i tak nie kupicie.",
    drill: "Przed każdą rundą sprawdź minimum kasy teamu na następną rundę (loss bonus) i zdecydujcie razem.",
    pro: "pro: force głównie w 2. rundzie i przy match poincie",
    weight: 0.9,
    clip: { before: 1, after: 6 },
  },
  no_drop: {
    category: "economy",
    label: "Brak dropu",
    title: "Nie dropisz broni koledze",
    why: "Kolega bez broni to gracz mniej w pełnym zakupie; drop wyrównuje ekonomię teamu.",
    advice: "Gdy po zakupach zostaje ci na drugą broń, kup ją koledze bez kasy (drop na G) jeszcze w freeze time.",
    drill: "Po każdym freeze time spójrz na tabelę kasy (Tab) i zapytaj, kto potrzebuje dropu.",
    pro: "pro: 0 rund z biednym kolegą, gdy ktoś ma kasę na drop",
    weight: 0.8,
    clip: { before: 1, after: 4 },
  },
  death_with_money: {
    category: "economy",
    label: "Śmierć z kasą",
    title: "Giniesz z dużą kasą",
    why: "Niewydane pieniądze nie pomagają w rundzie: brakuje utility, armora albo lepszej broni, a w ostatniej rundzie połowy kasa przepada.",
    advice: "Wydaj resztę na utility i pancerz albo dropnij broń; w ostatniej rundzie połowy wydaj wszystko.",
    drill: "Przy pełnym zakupie miej zawsze komplet: pancerz z hełmem, smoke, flash i molotov/HE.",
    pro: "pro: ok. 0–500 $ niewydane w pełnym zakupie",
    weight: 0.6,
    clip: { before: 3, after: 1 },
  },

  // ─── Pozycje (S12) ───
  predictable_position: {
    category: "positioning",
    label: "Przewidywalna pozycja",
    title: "Jako CT stoisz co rundę w tym samym miejscu",
    why: "Po kilku rundach rywale wiedzą, gdzie stoisz, i przychodzą z utility albo pre-aimem na twoją pozycję.",
    advice: "Co 2–3 rundy zmień pozycję albo timing (inny kąt, agresja, cofnięcie); bądź tam, gdzie wróg się nie spodziewa.",
    drill: "Na każdy bombsite twojej mapy przygotuj 3 pozycje CT i rotuj je w ciągu połowy.",
    pro: "pro: zmieniają pozycję lub timing co 2–3 rundy",
    weight: 1,
    clip: { before: 3, after: 3 },
  },
  clutch_decision: {
    category: "positioning",
    label: "Decyzja w clutchu",
    title: "Złe decyzje w clutchu",
    why: "W clutchu liczy się czas i bomba, a nie liczba fragów; zła decyzja kosztuje rundę albo broń na następną.",
    advice: "Policz czas: jako CT bez szans na rozbrojenie ratuj broń, jako T z bombą graj na czas i nie wychodź na walkę.",
    drill: "Obejrzyj w replayu swoje clutche i przy każdym zapisz: czas, liczbę wrogów, bombę i co było najlepszą opcją.",
    pro: "pro: save przy braku szans na rozbrojenie",
    weight: 1,
    clip: { before: 4, after: 2 },
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
