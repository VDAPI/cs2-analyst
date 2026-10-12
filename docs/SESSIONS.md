# CS2 Analyst — plan sesji Claude Code

> Ustalone 12.10.2026 z właścicielem projektu. Każda sesja = jedna gałąź i jeden PR.
> Jak zacząć sesję: otwórz Claude Code w tym repo i napisz `Zrób sesję S<n> z docs/SESSIONS.md`.
> Sesje są w kolejności zależności; sesja może się zacząć, gdy jej „Wymaga” jest zmergowane.

## Ustalenia, które obowiązują we wszystkich sesjach

- **Niczego nie usuwamy.** Wszystkie obecne ekrany i funkcje zostają (mecze, gracze, porównanie, heatmapy, granaty, ekonomia, replay 2D, clutche, trade'y, multi-kille, FACEIT, Steam, upload). Przebudowujemy wygląd i dokładamy nowe funkcje.
- **Kolorystyka: Violet Lime (Esport Neon).** Tło `#08070D`, panel `#100E19`, panel wyżej `#181528`, tekst `#F3F0FF`, akcent 1 fiolet `#9B6BFF`, akcent 2 limonka `#C6FF3D`, linie `rgba(190,160,255,0.12)`. Stałe znaczenia: CT `#5AA9FF`, T `#FFC23D`, błąd `#FF4D6A`, dobra decyzja `#3DF5A0`, ostrzeżenie `#FFB020`. Fonty: Chakra Petch (nagłówki), Geist (tekst), Geist Mono (liczby).
- **Wersja mobilna obowiązkowa.** Każdy ekran działa od 360 px szerokości, bez poziomego scrolla strony.
- **Dema:** gracz może wgrać dowolne demo (FACEIT, Premier, inne). Gdy analiza potrzebuje dema z FACEIT, pobieramy je przez Downloads API tylko na żądanie gracza (zaznaczone mecze), nigdy automatycznie w tle. Według właściciela (12.10.2026) dostęp do Downloads API powinien już działać; jeśli pobieranie zwraca błąd uprawnień, pokaż graczowi upload jako zapasową drogę.
- **Po analizie kasujemy plik .dem.** W bazie zostaje raport i próbkowane dane do replaya. Gracz może oznaczyć mecz „zachowaj demo”.
- **Analiza jak najszczegółowsza:** mechanika i taktyka. Każdy wykryty błąd ma moment w rundzie, podgląd 2D, jedną radę i porównanie z pro.
- **Rady oceniamy po tym, co gracz mógł wiedzieć** (dźwięk, widoczność, info od teamu), a nie po widoku „z góry” w demie.
- **Model:** darmowe z limitem meczów; płatności później.

## Pełna lista funkcji

Status: ✅ jest w kodzie · 🎨 jest, do przebudowy wyglądu · 🆕 nowe. Kolumna „Sesja” mówi, gdzie powstaje lub zmienia się dana rzecz.

| Obszar | Funkcja | Status | Sesja |
| --- | --- | --- | --- |
| Konto | Email + hasło, Steam opcjonalnie, dev login | ✅ | S2 (wygląd) |
| Konto | Połączenie FACEIT (OAuth PKCE), synchronizacja historii | ✅ | S7 |
| Konto | Ustawienia, avatar, odłączanie kont | 🎨 | S4 |
| Strona główna | Hero z biegającymi neonowymi żołnierzami CT/T | ✅ | S3 |
| Strona główna | Sekcje: jak to działa, przykładowy raport, FAQ, CTA | ✅ | S3 |
| Mecze | Lista meczów (upload + FACEIT) | 🎨 | S4 |
| Mecze | Zaznaczanie wielu meczów z historii FACEIT i „Analizuj zaznaczone” | 🆕 | S7 |
| Mecze | Kolejka analizy ze statusem każdego meczu | 🆕 | S7 |
| Mecze | Upload dowolnego dema, drag and drop, wiele plików naraz | 🎨/🆕 | S7 |
| Mecze | Biblioteka analiz, usuwanie dema i analizy, „zachowaj demo” | 🆕 | S7 |
| Mecz | Scoreboard, rundy, oś czasu rundy | 🎨 | S4 |
| Mecz | Clutche, trade'y, multi-kille, opening duels | ✅ | S4 (wygląd) |
| Gracze | Profil gracza, historia, forma | 🎨 | S4 |
| Porównanie | Radar, statystyki obok siebie, head-to-head, mapy, forma | 🎨 | S4 |
| Replay 2D | Odtwarzacz rund (Canvas), sterowanie dotykiem, zoom, wybór gracza | ✅ | S5, S6 |
| Replay 2D | Dane replaya z bazy zamiast z pliku .dem | 🆕 | S6 |
| Replay 2D | Stożek widzenia (FOV), timery utility, HP, broń | ✅ | S10 |
| Replay 2D | Znaczniki błędów na osi czasu, skok do błędu, klip 2D błędu | ✅ | S10 |
| Replay 2D | Notatki na mapie, udostępnianie linku do momentu | ✅ | S16 |
| Heatmapy | Heatmapy meczu i zbiorcze per mapa | ✅ | S5 |
| Granaty | Trajektorie granatów, utility damage | ✅ | S5 |
| Ekonomia | Wykres ekonomii, koordynacja zakupów | ✅ | S5 |
| Mechanika | Strzał w ruchu (counter-strafe) per broń | 🆕 | S8 |
| Mechanika | Czas counter-strafe | 🆕 | S8 |
| Mechanika | Celność pierwszej kuli, HS% per broń | 🆕 | S8 |
| Mechanika | Crosshair placement (kąt do głowy przy pojawieniu się wroga) | ✅ | S9 |
| Mechanika | Time to damage, czas reakcji | ✅ | S9 |
| Mechanika | Spray control (rozrzut w serii) | ✅ | S9 |
| Mechanika | Flick vs tracking, overflick | ✅ | S9 |
| Mechanika | Rodzaje peeków (wide, jiggle, shoulder, dry peek) | ✅ | S9 |
| Mechanika | Ruch i dźwięk (bieganie przy wrogu, zbędne skoki) | ✅ | S9 |
| Mechanika | Reload w złym momencie | ✅ | S9 |
| Taktyka | Smoke za wcześnie / w próżnię | ✅ | S11 |
| Taktyka | Flash: czas oślepienia wrogów, flashe w swoich, flash bez peeka | ✅ | S11 |
| Taktyka | Molotov i HE bez efektu | ✅ | S11 |
| Taktyka | Śmierć z niewykorzystanym utility | ✅ | S11 |
| Taktyka | Baza lineupów per mapa i rozpoznawanie lineupów | ✅ | S11 |
| Taktyka | Śmierć bez trade'u, brak trade'u kolegi | ✅ | S12 |
| Taktyka | Rotacje (za wcześnie, na fejk) | ✅ | S12 |
| Taktyka | Błędy ekonomii (force, brak dropu, śmierć z kasą) | ✅ | S12 |
| Taktyka | Przewidywalna pozycja (ta sama pozycja wiele rund) | ✅ | S12 |
| Taktyka | Entry, lurk, post-plant, retake, decyzje w clutchu | ✅ | S12 |
| Raport | Raport „co poprawić” z priorytetami | ✅ | S10 |
| Pro | Pipeline dem pro i normy pro per mapa/strona/sytuacja | ✅ | S13 |
| Pro | Porównanie każdej metryki z pro i z rangą | ✅ | S13 |
| Pro | Model szansy wygranej rundy, wpływ każdej decyzji | ✅ | S14 |
| Pro | „Co zrobiłby pro” w podobnej sytuacji | ✅ | S14 |
| Trener AI | Rady w ludzkim języku (Claude API), plan treningu, ćwiczenia | ✅ | S15 |
| Trener AI | Ocena rad (przydatne / nie) i uczenie kolejności rad | ✅ | S15 |
| Postęp | Trendy metryk w czasie, cele, odznaki | ✅ | S16 |
| Społeczność | Publiczny profil, udostępnianie raportu | ✅ | S16 |
| Drużyna | Dashboard drużyny, anti-strat przeciwnika, tablica taktyczna | 🆕 | S17 |
| Inne źródła | Premier/Steam (share code lub upload) dla chętnych | ✅ | S18 |
| Platforma | PWA, powiadomienia „analiza gotowa”, PL/EN | ✅ | S18 |
| Platforma | Storage R2, limity darmowego planu | 🆕 | S7 |
| Jakość | Testy E2E (Playwright) głównych ścieżek, desktop i telefon, w CI | ✅ | S19 |
| Jakość | Lokalne środowisko testowe jednym poleceniem (Docker), dostęp z telefonu w sieci Wi-Fi | ✅ | S20 |
| Start | Demo bez logowania: przykładowa analiza meczu pro, przewodnik po aplikacji | 🆕 | S21 |
| Trening | Generator treningu: mapy Workshop, configi .cfg, rutyna dnia | ✅ | S22 |
| Trening | Trener lineupów: komendy setpos/setang do skopiowania, config do ćwiczenia granatów | ✅ | S22 |
| Przed meczem | Scouting rywali z linku do pokoju FACEIT, sugestia veto map | 🆕 | S23 |
| Pro | „Graj jak pro”: porównanie z wybranym zawodowcem per mapa i rola | 🆕 | S24 |
| ML | Wykrywanie roli (entry, AWP, support, lurk, anchor) i rady pod rolę | 🆕 | S24 |
| Społeczność | Klipy 2D błędów i highlightów do pobrania (MP4/GIF) i udostępnienia | 🆕 | S25 |
| Społeczność | Ranking znajomych, wyzwania tygodniowe | 🆕 | S25 |
| Integracje | Bot Discord: powiadomienia i komenda /stats | 🆕 | S26 |
| Integracje | Rozszerzenie przeglądarki: przycisk „Analizuj” na stronie meczu FACEIT | 🆕 | S26 |
| Platforma | Panel admina, monitoring kolejki, błędy (Sentry), statystyki użycia | ✅ | S27 |
| Platforma | Wydajność: szybsze parsowanie, cache, Lighthouse mobile ≥ 90 | 🆕 | S28 |
| Platforma | Bezpieczeństwo i RODO: usunięcie konta i danych, polityka prywatności, rate limiting | 🆕 | S29 |
| Platforma | Plan Pro i płatności (Stripe) | 🆕 | S30 |

## Sesje

### S1. Konteksty i porządek w dokumentacji
- **Cel:** Claude Code w kolejnych sesjach ma aktualną wiedzę o projekcie.
- **Zakres:** zaktualizuj `CLAUDE.md` (logowanie: email + hasło, Steam opcjonalny; nowa paleta; zasady z sekcji „Ustalenia”; link do tego pliku). Usuń z README odwołanie do nieistniejącego `AGENTS.md` albo je utwórz. Zaktualizuj checkboxy w `PLAN.md` do stanu kodu. Zaktualizuj skille w `.claude/skills/` (design-system: Violet Lime; cs2-analysis i demo-parsing: nowe metryki z S8–S12, pola ticków `velocity_X/Y`, `pitch`, `yaw`, eventy `weapon_fire`). Przepisz `DESIGN.md` na Violet Lime.
- **Gotowe, gdy:** żaden plik kontekstu nie przeczy kodowi ani ustaleniom.

### S2. Design system Violet Lime
- **Wymaga:** S1.
- **Zakres:** tokeny w `src/styles/globals.css`, font Chakra Petch obok Geist, komponenty w `src/components/ui/` (button, card, badge, stat-card i nowe: checkbox, tabs, toast, progress, tag błędu), sidebar i topbar z grupami Analiza / Narzędzia / Pro i drużyna, nawigacja mobilna (dolny pasek lub szuflada). Ekrany logowania i rejestracji w nowym stylu.
- **Gotowe, gdy:** cała aplikacja ma nowe kolory, a nawigacja działa na 360 px.
- **Status:** ✅ zrobione. Tokeny Violet Lime, Chakra Petch, nowe komponenty ui (checkbox, tabs, toast, progress, input, tag błędu), pogrupowany sidebar, szuflada i dolny pasek na telefonie, logowanie i rejestracja w nowym stylu.

### S3. Strona główna
- **Wymaga:** S2.
- **Zakres:** hero z Canvas: neonowe sylwetki żołnierzy (CT: hełm, plecak, M4; T: kominiarka, AK) biegające po trasach mapy ze śladem. Wzór w artefakcie z próbkami. Animacja pauzuje przy ukrytej karcie, przy `prefers-reduced-motion` stoi. Docelowo trasy z prawdziwych dem pro (po S13). Sekcje: jak to działa (3 kroki), przykładowy raport, funkcje, FAQ, CTA „Połącz FACEIT” i „Wgraj demo”. OG image.
- **Gotowe, gdy:** strona główna działa płynnie na telefonie i desktopie.
- **Status:** ✅ zrobione. Canvas `src/components/landing/hero-runners.tsx` (CT: hełm, plecak, M4; T: kominiarka, AK; ślad za biegaczem; pauza przy ukrytej karcie i poza ekranem; przy `prefers-reduced-motion` stoi), sekcje jak to działa, przykładowy raport, funkcje, FAQ, CTA „Połącz FACEIT” i „Wgraj demo”, OG image (`src/app/opengraph-image.tsx`). Logowanie wraca pod `callbackUrl`. Trasy są ręczne; prawdziwe trasy pro po S13.

### S4. Przebudowa ekranów: mecze, mecz, gracze, porównanie, ustawienia
- **Wymaga:** S2.
- **Zakres:** nowy wygląd i układ mobilny dla `/matches`, `/matches/[id]`, `/players`, `/players/[steamId]`, `/compare/*`, `/settings`. Bez usuwania żadnej funkcji.
- **Gotowe, gdy:** wszystkie te ekrany działają na 360 px i w nowym stylu.
- **Status:** ✅ zrobione. Nowy wygląd i układ mobilny (sprawdzone zrzutami na 360 px) dla meczów, meczu, graczy, profilu, porównania i ustawień, a przy okazji biblioteki, kolejki, historii FACEIT i uploadu. Interfejs tych ekranów po polsku. Wspólne klocki: `PageHeader`, `EmptyState`, `SectionTitle`, `src/components/match/*` (wynik W/P/R, miniatura mapy, plakietka źródła), klasy `.table-scroll` + `.data-table` (przyklejona kolumna nazwy), daty `formatDate` (pl-PL).

### S5. Przebudowa narzędzi: replay, heatmapy, granaty, ekonomia
- **Wymaga:** S2.
- **Zakres:** nowy wygląd Canvasów i wykresów (kolory CT/T, utility), sterowanie replayem na dotyk, układ mobilny.
- **Gotowe, gdy:** narzędzia są czytelne i sterowalne na telefonie.

### S6. Dane replaya w bazie (warunek kasowania dem)
- **Wymaga:** nic (może iść równolegle z S2–S5).
- **Problem:** `src/app/api/matches/[matchId]/ticks/route.ts` czyta ticki na żywo z pliku .dem, a `workers/demo-parser.worker.ts` kasuje dema FACEIT po parsowaniu, więc replay meczów z FACEIT najpewniej nie działa.
- **Zakres:** w workerze zapisz próbkowane ticki (np. co 4 ticki: X, Y, Z, `velocity_X`, `velocity_Y`, `pitch`, `yaw`, HP, armor, `is_alive`, broń, flash duration) w zwartym formacie (np. kolumnowy JSON lub bytea per runda). Zapisz też wszystkie `weapon_fire` i `player_hurt` potrzebne w S8–S12. Przełącz endpoint ticków na bazę. Skrypt backfill dla meczów, które jeszcze mają plik. Zmierz rozmiar danych na mecz.
- **Gotowe, gdy:** replay działa po usunięciu pliku .dem; test regresji bez dema.

### S7. Wybór meczów, kolejka, biblioteka analiz, usuwanie dem, R2
- **Wymaga:** S6.
- **Zakres:** lista historii FACEIT z checkboxami, filtrami (mapa, wynik, okres) i limitem planu; „Analizuj zaznaczone” tworzy zadania pobrania przez Downloads API (istniejący `workers/faceit-demo-download.worker.ts`), a gdy API niedostępne, prowadzi do uploadu z podpowiedzią „pobierz demo z FACEIT”. Upload wielu plików naraz. Ekran kolejki ze statusem. Biblioteka analiz: zapisane raporty, „usuń analizę”, „zachowaj demo”. Kasowanie .dem po analizie dla wszystkich źródeł (poza „zachowaj”). Storage w Cloudflare R2. Limity darmowego planu w `src/lib/limits.ts`.
- **Gotowe, gdy:** gracz zaznacza 5 meczów, dostaje 5 raportów, a dema znikają z dysku/R2.

### S8. Mechanika 1: ruch przy strzale
- **Wymaga:** S6.
- **Zakres:** dla każdego `weapon_fire` pobierz prędkość gracza w tym ticku; licz „strzał w ruchu”, gdy prędkość > progu celności broni (tabela per broń, start: ok. 1/3 prędkości maks.). Czas counter-strafe (od zmiany kierunku do prędkości ~0). Celność pierwszej kuli, HS% per broń. Liczone tylko dla pierwszego strzału pojedynku i osobno dla serii. Zapis per gracz per mecz + lista momentów.
- **Gotowe, gdy:** raport pokazuje % strzałów w ruchu z listą momentów; test na syntetycznych tickach.

### S9. Mechanika 2: celowanie i pojedynki
- **Wymaga:** S8.
- **Zakres:** crosshair placement (kąt między celownikiem a głową wroga w ticku, w którym wróg staje się widoczny; widoczność przybliżona linią wzroku i FOV), time to damage, czas reakcji, spray control, flick vs tracking (prędkość kątowa przed trafieniem), rodzaje peeków, bieganie przy wrogach (dźwięk), skoki, reload w złym momencie.
- **Gotowe, gdy:** każda metryka ma wartość, próg i listę momentów.

### S10. Raport „co poprawić” i replay z błędami
- **Wymaga:** S8, S5.
- **Zakres:** model danych `Finding` (typ, gracz, runda, tick, ważność, liczby, rada). Ekran raportu: top 3 rzeczy do poprawy, potem wszystko według kategorii. Karta błędu z mini-replayem 2D. Znaczniki błędów na osi czasu replaya, skok do momentu, stożek widzenia, timery utility.
- **Gotowe, gdy:** z karty błędu jednym kliknięciem widać ten moment w replayu.

### S11. Taktyka 1: utility
- **Wymaga:** S10.
- **Zakres:** smoke za wcześnie lub w próżnię (czas od startu rundy, brak wroga w zasięgu wpływu, brak info dla gracza, brak akcji teamu w kilka sekund), flash (czas oślepienia wrogów, oślepieni koledzy, flash bez peeka), molotov/HE bez efektu, śmierć z utility. Baza lineupów per mapa (pozycja i kąt rzutu → nazwa, np. „Window smoke”) i podpowiedź lepszego lineupu.
- **Gotowe, gdy:** przykład „smoke na A main o 1:45 jako CT” pojawia się jako Finding z radą.

### S12. Taktyka 2: drużyna, ekonomia, pozycje
- **Wymaga:** S10.
- **Zakres:** śmierć bez trade'u (odległość i czas do najbliższego kolegi), brak trade'u kolegi (~3 s), rotacje, błędy ekonomii (force w złym momencie, brak dropu, śmierć z dużą kasą), przewidywalna pozycja CT, entry/lurk, post-plant, retake, decyzje w clutchu. Pamiętaj o stronach per połowa (CLAUDE.md).
- **Gotowe, gdy:** każdy typ ma Finding z radą i test bez dema.

### S13. Dane pro i normy
- **Wymaga:** S9, S12.
- **Zakres:** zanim cokolwiek zautomatyzujesz, sprawdź regulamin HLTV. Pipeline: folder z ręcznie wybranymi demami pro → ten sam parser → te same metryki → normy per mapa, strona, sytuacja (percentyle). Porównanie każdej metryki gracza z pro i z jego rangą.
- **Gotowe, gdy:** raport pokazuje „pro: X” przy każdej metryce.
- **Status:** ✅ zrobione. Regulamin HLTV (pkt 2.2, 3.2) zabrania scrapowania i użycia ich materiałów w celach biznesowych, więc nic nie pobieramy automatycznie: dema pro dodaje admin w `/admin/pro` albo `npm run pro:import -- <folder>`. Idą tym samym parserem i tymi samymi metrykami, a `NormSample` + `MetricNorm` dają percentyle per pula (pro, wszyscy, ranga), mapa, strona i broń. Ranga: poziom FACEIT z pokoju meczu, CS Rating Premier i ranga MM z dema. Raport pokazuje „pro: X” i medianę rangi przy każdej metryce oraz tabelę „Ty vs pro”, ekran `/pro` pokazuje wszystkie normy. Do czasu wgrania dem pro wartości są orientacyjne (≈), z publicznych źródeł sprawdzonych przez dwóch niezależnych agentów; przy okazji poprawione progi raportu, które oznaczałyby typowego pro jako „źle” (HS% liczony od trafień, counter-strafe, time to damage, overflick, biegi, skoki, przeładowania, trade'y, HE, molotov, utility na śmierć).

### S14. Model szansy wygranej i „co zrobiłby pro”
- **Wymaga:** S13.
- **Zakres:** osobna usługa w Pythonie (LightGBM/XGBoost) liczy szansę wygranej rundy z (żywi, HP, ekonomia, bomba, czas, pozycje, utility). Wpływ decyzji = zmiana szansy. Wyszukiwanie podobnych sytuacji w danych pro i pokazanie, co pro robili najczęściej, z klipem 2D.
- **Gotowe, gdy:** Finding pokazuje „kosztowało team X pp szansy na rundę”.
- **Status:** ✅ zrobione. Szansa wygranej rundy liczona z 27 cech stanu (żywi, HP, pancerz, wartość sprzętu, karabiny, AWP, czas, bomba i czas na defuse, odległości do bomby i bombsite'ów, zużyte utility), `src/lib/winprob/`. Usługa w Pythonie (`ml/`, LightGBM 4.7, serwis `ml` w `docker-compose.yml`, albo `npm run ml:train`) porównuje na danych z bazy (walidacja krzyżowa po meczach) model wyjściowy, regresję logistyczną i dwa warianty LightGBM (z ograniczeniami monotoniczności: śmierć gracza nigdy nie podnosi szansy jego drużyny) i zapisuje najlepszy, gdy jest lepszy od wyjściowego; po każdej analizie worker prosi o ponowny trening, gdy przybyły mecze. Drzewa są eksportowane do JSON i liczone w TypeScripcie (test zgodności z LightGBM). Do 20 meczów z danymi replayu działa model wyjściowy dopasowany do publicznych statystyk rund (oznaczony ≈ w UI). Wpływ błędu liczony kontrfaktycznie: śmierć (szansa z graczem żywym vs. po śmierci), flash w swoich (śmierć kolegi), brak trade'u (gdyby zabójca zginął), brak dropu (kolega z karabinem); typy bez uczciwej miary nie dostają liczby. Karta błędu pokazuje „kosztowało team X pp szansy na rundę” i przycisk „Co zrobiłby pro?”: sytuacje z dem pro na tej mapie (co 2 s każdy żywy gracz: strona, żywi, bomba, czas, odległości, sprzęt; akcja w kolejnych 5 s: plant, defuse, utility, wejście, cofnięcie, zmiana pozycji, trzymanie), najczęstsze akcje pro z ich średnim wpływem na szansę i klipy 2D z dem pro. Raport: suma kosztu błędów, koszt przy każdym problemie i WPA gracza (pp na rundę z zabójstw i śmierci, jak Xenopoulos i in.). Replay: pasek szansy CT/T pod osią czasu. Admin: `/admin/ml` (porównanie modeli, historia, trening ręczny). Test: `npm run test:winprob`, `npm run ml:test`.

### S15. Trener AI
- **Wymaga:** S10 (lepiej po S13).
- **Zakres:** rady pisane przez Claude API wyłącznie na podstawie Findingów i liczb (bez wymyślania faktów), po polsku i angielsku. Plan treningu na tydzień (mapy Workshop, ćwiczenia, cele liczbowe). Ocena rad „przydatne / nie” i sortowanie rad według ocen.
- **Gotowe, gdy:** po analizie gracz dostaje plan treningu z celami.
- **Status:** ✅ zrobione. Ekran `/coach` (w menu „Trener”): plan na bieżący tydzień z 10 ostatnich meczów gracza — do 3 celów (najwyżej 2 z jednej kategorii), przy każdym liczba teraz → cel na tydzień (cel z Postępu albo krok w jego stronę, gdy jest daleko), liczba momentów na mecz z celem, porównanie z pro, 1–2 ćwiczenia z biblioteki (mapy Workshop jako link do wyszukiwarki Workshop, serwery, ekrany aplikacji: Lineupy, Replay 2D, Heatmapy, Ekonomia), przykłady z replayu 2D i rozpiska dzień po dniu (rozgrzewka, ćwiczenie celu, 3 mecze z jednym celem, niedziela przegląd) z odhaczaniem dni. „Ustaw cele z planu” zapisuje cele w Postępie. Plan przebudowuje się po każdej analizie (worker) i przy wejściu, gdy zmieniły się mecze lub oceny. Raport meczu ma sekcję „Trener AI”: podsumowanie i rada do każdego z 3 najważniejszych problemów. Teksty pisze Claude API (`ANTHROPIC_API_KEY`, model `COACH_MODEL`, domyślnie `claude-opus-5-5`, structured output, fallback przy odmowie) wyłącznie z faktów: błędów, liczb i standardowych rad; każda liczba w tekście AI musi występować w faktach, inaczej ten fragment zastępuje rada standardowa. Cele, ćwiczenia i dni wybiera kod, nie AI. Bez klucza wszystko działa na radach standardowych (PL/EN, katalog błędów przetłumaczony w `src/lib/coach/catalog-en.ts`). Limit 40 tekstów AI na użytkownika na dobę, cache per mecz/plan i język. Oceny „przydatne / nieprzydatne” (kciuki) przy każdej radzie w raporcie i planie: własne oceny gracza mocno, oceny wszystkich lekko zmieniają kolejność rad (wygładzanie Beta, `src/lib/coach/ranking.ts`). Test: `npm run test:coach`.

### S16. Postęp i udostępnianie
- **Wymaga:** S10.
- **Zakres:** trendy metryk w czasie, cele (np. strzały w ruchu < 15%), odznaki, publiczny profil, udostępnianie raportu i momentu replaya linkiem, notatki na mapie.
- **Gotowe, gdy:** gracz widzi swój postęp w 10 ostatnich meczach.
- **Status:** ✅ zrobione. Ekran `/progress` (w menu „Postęp”): 10/20/50 ostatnich meczów, kafelki (wygrane, średni rating, poważne błędy na 10 rund), wykres każdej metryki z oceną meczu na kropce i strzałką trendu (ostatnie 3 mecze vs wcześniejsze; wyżej na wykresie = lepiej), cele (średnia z 5 ostatnich meczów, podpowiedzi z najsłabszych metryk, do 6 celów) i 12 odznak liczonych z historii. Gracz rozpoznawany po Steam, nicku FACEIT albo najczęstszym graczu w demach; inaczej wybiera siebie. Udostępnianie: przycisk „Udostępnij” w raporcie i „Publiczny link do momentu” w replayu tworzą link `/s/<token>` (bez logowania, noindex, licznik wyświetleń, wyłączanie w Ustawieniach); dane replaya czytane przez `?share=`, link do momentu otwiera tylko swoją rundę. Notatki na mapie w replayu (pinezka w miejscu i chwili, widoczne też w udostępnionym momencie). Publiczny profil `/u/<adres>` włączany w Ustawieniach: forma, odznaki, ostatnie mecze z linkami do udostępnionych raportów, bez e-maila i szczegółów błędów. Przy okazji trasy `kills` i `bombs` sprawdzają teraz właściciela meczu (wcześniej nie sprawdzały).

### S17. Drużyna
- **Wymaga:** S12.
- **Zakres:** drużyny (model `Team` już jest), dashboard drużyny, anti-strat przeciwnika (defaulty, executes, retake), tablica taktyczna z zapisem.
- **Gotowe, gdy:** drużyna widzi wspólne statystyki i tendencje rywala.

### S18. Platforma
- **Wymaga:** S7.
- **Zakres:** Premier/Steam dla chętnych (share code lub upload), PWA (instalacja na telefonie), powiadomienia „analiza gotowa”, tłumaczenie PL/EN.
- **Gotowe, gdy:** aplikację da się zainstalować na telefonie i dostać powiadomienie.
- **Status:** ✅ zrobione. Ekran `/premier`: mecze Premier po kodzie udostępniania (opcjonalnie z linkiem do powtórki Valve, wtedy demo pobiera serwer po kliknięciu „Analizuj”), opcjonalna historia ze Steam (kod uwierzytelniający + „Synchronizuj”, wymaga `STEAM_API_KEY`), bez linku: upload z `?steam=`. PWA: manifest, ikony, service worker z ekranem offline, instalacja z Ustawień (Android/desktop przyciskiem, iOS instrukcją). Powiadomienia: dzwonek w górnym pasku + Web Push „analiza gotowa / nie powiodła się” z workerów (klucze VAPID z env albo generowane raz i trzymane w bazie). PL/EN: słowniki w `src/lib/i18n/`, przełącznik w Ustawieniach, menu konta i na logowaniu. Przetłumaczone: nawigacja, logowanie, rejestracja, ustawienia, upload, Premier, powiadomienia, offline. **Do zrobienia:** reszta ekranów (mecze, gracze, porównanie, mechanika, narzędzia, kolejka, biblioteka) nadal po polsku; dopóki ich nie ma, język przeglądarki nie jest wykrywany (`DETECT_BROWSER_LANGUAGE`). Pobieranie dem po samym kodzie udostępniania wymagałoby bota Steam Game Coordinator — świadomie pominięte.

## Sesje — etap 2 (dopisane 12.10.2026 po S1–S9)

### S19. Testy E2E i jakość
- **Wymaga:** S10.
- **Zakres:** Playwright z przykładowym demem (fixture) i seedem bazy: logowanie, upload, kolejka, raport, replay, porównanie, usuwanie dema. Każdy test na 1280 px i 390 px. Zrzuty ekranu do porównań wizualnych. Uruchamianie w CI (Postgres i Redis jako services). Napraw błędy, które testy znajdą.
- **Gotowe, gdy:** CI uruchamia E2E na każdym PR i są zielone.
- **Status:** ✅ zrobione. Playwright (`npm run test:e2e`): każdy ekran z `main` (31 zalogowanych + strona główna, logowanie, rejestracja) na 1280 px i 360 px — bez błędów w przeglądarce, bez przewijania w bok, zrzut porównany z wzorcem; ścieżki: rejestracja i wylogowanie, upload → analiza → raport → replay → usunięcie analizy, „zachowaj demo” i ręczne usunięcie pliku, uszkodzone demo w kolejce, porównanie graczy, udostępniony raport bez logowania. Zamiast 100-megabajtowego .dem testy wgrywają symulowane demo (`src/lib/parsers/fixture-demo.ts`, mecz na Mirage z ruchem, strzałami, granatami i bombą), które odpowiada jak parser przy `E2E_FIXTURE_DEMOS=1`; cała reszta pipeline’u jest prawdziwa. W CI osobne zadanie `e2e` w obrazie Playwright z Postgres i Redis. Naprawione przy okazji: logowanie i rejestracja nie działały bez `STEAM_API_KEY` (przycisk Steam jest teraz tylko z kluczem). Demo testowe przechodzi też kontrole parsera z audytu (`npm run test:e2e-demo -- --fixture`, w CI).

### S20. Lokalne środowisko testowe jednym poleceniem
- **Wymaga:** S19. Decyzja właściciela (12.10.2026): na razie bez hostingu, testy lokalnie.
- **Zakres:** `docker compose up` stawia wszystko: aplikację, worker, Postgres, Redis i MinIO zamiast R2 (to samo API S3). Skrypt `npm run setup:local` (migracje, seed z kontem testowym i 3 przykładowymi analizami, przykładowe demo). Dostęp z telefonu w tej samej sieci Wi-Fi (adres IP komputera, bez problemów z HTTPS/cookies). Instrukcja po polsku krok po kroku w `docs/TESTOWANIE.md` (Windows i macOS), z listą rzeczy do sprawdzenia.
- **Gotowe, gdy:** na czystym komputerze z Dockerem jedno polecenie uruchamia całą aplikację, a telefon w tej samej sieci ją otwiera.
- **Status:** ✅ zrobione. `docker compose up -d --build` stawia aplikację, worker analizy, worker FACEIT, Postgres, Redis, MinIO (dema przez klienta R2, `R2_ENDPOINT`) i wejście HTTPS `https://localhost:3443` (Caddy, do łączenia FACEIT). Jednorazowy `setup` (`npm run setup:local`) aktualizuje schemat, tworzy konto `test@cs2analyst.local` / `test1234` (admin) z 3 przykładowymi analizami i pobiera prawdziwe demo do `data/przyklad/`. Telefon w tej samej sieci otwiera `http://<IP komputera>:3000`; logowanie działa na każdym adresie naraz (`AUTH_TRUST_HOST`, middleware czyta ciasteczko sesji z http i https). Instrukcja po polsku: `docs/TESTOWANIE.md` (Windows i macOS, klucze API, admin, FACEIT, lista rzeczy do sprawdzenia). CI (`local-env.yml`) buduje całość na czystej maszynie i sprawdza logowanie z adresu sieciowego oraz analizę prawdziwego dema przez MinIO.

### S21. Demo bez logowania i onboarding
- **Wymaga:** S10.
- **Zakres:** publiczna przykładowa analiza (mecz pro lub własny mecz właściciela za zgodą), przycisk „Zobacz przykład” na stronie głównej, przewodnik po raporcie przy pierwszym logowaniu, puste stany z instrukcją.
- **Gotowe, gdy:** nowa osoba widzi pełny raport bez zakładania konta.

### S22. Trening: generator rutyny i trener lineupów
- **Wymaga:** S11, S15.
- **Zakres:** na podstawie Findingów rutyna dnia (konkretne mapy Workshop, czas, cel liczbowy) i plik `.cfg` do pobrania. Trener lineupów: z bazy lineupów z S11 komendy `setpos`/`setang` do skopiowania jednym kliknięciem i config do ćwiczenia granatów (`sv_cheats`, `sv_infinite_ammo`, `sv_grenade_trajectory_prac_pipreview`). Zaznaczanie lineupów jako „opanowane”.
- **Gotowe, gdy:** z karty błędu „smoke za wcześnie” da się przejść do ćwiczenia lepszego lineupu.
- **Status:** ✅ zrobione. Ekran `/training` („Trening” w menu, link z Trenera): rutyna na dziś (albo dowolny dzień tygodnia) z planu S15 — każde ćwiczenie z konkretną mapą Workshop (link do wyszukiwarki Workshop), czasem i liczbą do osiągnięcia, mecze z celem liczbowym (momenty na mecz i metryka), odhaczanie dnia, lineupy dnia do nauki i plik `cs2a_routine.cfg` (wypisuje rutynę w konsoli, skróty `cs2a_practice`, `cs2a_1…`, `cs2a_rethrow`; bez bindów). Trener lineupów na `/lineups`: kopiowanie setpos/setang jednym kliknięciem, „Opanowany” przy każdym lineupie (filtr Do nauki / Opanowane, licznik %), plik `cs2a_lineups_<mapa>.cfg` z ustawieniami serwera do granatów (`sv_cheats 1`, `sv_infinite_ammo 1`, `sv_grenade_trajectory_prac_pipreview 1` i reszta) i aliasem na każdy nieopanowany lineup. Karta błędu „Smoke za wcześnie” (też smoke w próżnię, molotov bez efektu, lineup obok celu) w raporcie i w replayu ma przycisk „Ćwicz lineup”: otwiera lepsze lineupy na to miejsce z bazy, radar z miejscem twojego granatu i config z tymi lineupami. Test: `npm run test:training`.

### S23. Scouting rywali przed meczem
- **Wymaga:** S7.
- **Zakres:** gracz wkleja link do pokoju meczu FACEIT; z Data API pobieramy statystyki 10 graczy (mapy, winrate, K/D, ostatnia forma), pokazujemy najsłabsze i najmocniejsze mapy rywali i sugestię veto. Bez pobierania dem. Cache odpowiedzi API.
- **Gotowe, gdy:** po wklejeniu linku w kilka sekund widać kartę rywali z sugestią veto.

### S24. „Graj jak pro” i wykrywanie roli
- **Wymaga:** S13.
- **Zakres:** wykrywanie roli gracza w meczu (entry, AWP, support, lurk, anchor) z pozycji, kolejności kontaktów i broni; normy pro liczone osobno per rola; wybór ulubionego zawodowca i porównanie metryk, pozycji i timingu na mapie; rady dopasowane do roli.
- **Gotowe, gdy:** raport mówi „grałeś jako entry na Mirage” i porównuje z pro w tej roli.

### S25. Klipy, highlighty i rywalizacja ze znajomymi
- **Wymaga:** S16.
- **Zakres:** eksport klipu 2D (błąd albo highlight, np. clutch, ace) do MP4/GIF nagrywany z Canvas po stronie przeglądarki; strona klipu z podglądem do udostępnienia. Znajomi (z FACEIT lub zaproszenia), ranking znajomych po wybranych metrykach, wyzwania tygodniowe (np. „mniej niż 15% strzałów w ruchu w 3 meczach”).
- **Gotowe, gdy:** gracz pobiera klip clutcha i widzi swoje miejsce w rankingu znajomych.

### S26. Discord i rozszerzenie przeglądarki
- **Wymaga:** S7, S16.
- **Zakres:** bot Discord (powiadomienie „analiza gotowa”, `/stats`, `/ostatni-mecz`, link do raportu) z połączeniem konta. Rozszerzenie Chrome/Firefox dodające przycisk „Analizuj w CS2 Analyst” na stronie meczu FACEIT (otwiera nasz wybór meczu z zaznaczonym meczem; bez automatycznego pobierania).
- **Gotowe, gdy:** po analizie przychodzi wiadomość na Discord, a przycisk na FACEIT otwiera właściwy mecz.

### S27. Panel admina i monitoring
- **Wymaga:** S7.
- **Zakres:** panel admina (użytkownicy, limity, kolejka, nieudane analizy z możliwością ponowienia), Sentry dla aplikacji i workera, metryki: czas parsowania, długość kolejki, liczba analiz dziennie.
- **Gotowe, gdy:** nieudana analiza jest widoczna w panelu i da się ją ponowić.

### S28. Wydajność
- **Wymaga:** S19.
- **Zakres:** profil parsowania i zapisu ticków (cel: mecz w mniej niż 60 s), równoległe workery, cache zapytań raportu, lazy loading Canvasów, obrazy map w WebP, Lighthouse mobile ≥ 90 na stronie głównej i raporcie.
- **Gotowe, gdy:** pomiary przed i po są w opisie PR.

### S29. Bezpieczeństwo i prywatność
- **Wymaga:** S19.
- **Zakres:** usunięcie konta i wszystkich danych jednym przyciskiem, eksport danych, polityka prywatności i regulamin (szkic do przeglądu przez właściciela), rate limiting API i uploadu, walidacja plików .dem, przegląd uprawnień endpointów, nagłówki bezpieczeństwa.
- **Gotowe, gdy:** przegląd bezpieczeństwa nie ma otwartych krytycznych punktów.

### S30. Plan Pro i płatności
- **Wymaga:** S27. Decyzja właściciela (12.10.2026): budujemy teraz w trybie testowym Stripe, start publiczny dopiero po testach. Ceny startowe z `PLAN.md` (Pro ok. 6 USD/mies., Team ok. 15 USD/mies.), łatwe do zmiany w jednym miejscu.
- **Zakres:** Stripe (subskrypcja miesięczna i roczna), strona cennika, limity Free vs Pro w `src/lib/limits.ts`, portal klienta, webhooki, faktury.
- **Gotowe, gdy:** testowa płatność w trybie test Stripe podnosi limit.

## Kolejność

```
S1 → S2 → S3, S4, S5 (równolegle)
S6 (równolegle z S2–S5) → S7, S8
S8 → S9 → S13 → S14
S8 + S5 → S10 → S11, S12, S15, S16
S12 → S17 · S7 → S18
S10 → S19 → S20, S28, S29 · S10 → S21
S11 + S15 → S22 · S7 → S23, S27 · S13 → S24
S16 → S25 · S7 + S16 → S26 · S27 → S30
```
