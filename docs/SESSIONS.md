# CS2 Analyst — plan sesji Claude Code

> Ustalone 12.10.2026 z właścicielem projektu. Każda sesja = jedna gałąź i jeden PR.
> Jak zacząć sesję: otwórz Claude Code w tym repo i napisz `Zrób sesję S<n> z docs/SESSIONS.md`.
> Sesje są w kolejności zależności; sesja może się zacząć, gdy jej „Wymaga” jest zmergowane.

## Ustalenia, które obowiązują we wszystkich sesjach

- **Niczego nie usuwamy.** Wszystkie obecne ekrany i funkcje zostają (mecze, gracze, porównanie, heatmapy, granaty, ekonomia, replay 2D, clutche, trade'y, multi-kille, FACEIT, Steam, upload). Przebudowujemy wygląd i dokładamy nowe funkcje.
- **Kolorystyka: Violet Lime (Esport Neon).** Tło `#08070D`, panel `#100E19`, panel wyżej `#181528`, tekst `#F3F0FF`, akcent 1 fiolet `#9B6BFF`, akcent 2 limonka `#C6FF3D`, linie `rgba(190,160,255,0.12)`. Stałe znaczenia: CT `#5AA9FF`, T `#FFC23D`, błąd `#FF4D6A`, dobra decyzja `#3DF5A0`, ostrzeżenie `#FFB020`. Fonty: Chakra Petch (nagłówki), Geist (tekst), Geist Mono (liczby).
- **Wersja mobilna obowiązkowa.** Każdy ekran działa od 360 px szerokości, bez poziomego scrolla strony.
- **Dema:** gracz może wgrać dowolne demo (FACEIT, Premier, inne). Gdy analiza potrzebuje dema z FACEIT, pobieramy je przez Downloads API tylko na żądanie gracza (zaznaczone mecze), nigdy automatycznie w tle.
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
| Replay 2D | Odtwarzacz rund (Canvas) | 🎨 | S5, S6 |
| Replay 2D | Dane replaya z bazy zamiast z pliku .dem | 🆕 | S6 |
| Replay 2D | Stożek widzenia (FOV), timery utility, HP, broń | 🆕 | S10 |
| Replay 2D | Znaczniki błędów na osi czasu, skok do błędu, klip 2D błędu | 🆕 | S10 |
| Replay 2D | Notatki na mapie, udostępnianie linku do momentu | 🆕 | S16 |
| Heatmapy | Heatmapy meczu i zbiorcze per mapa | 🎨 | S5 |
| Granaty | Trajektorie granatów, utility damage | 🎨 | S5 |
| Ekonomia | Wykres ekonomii, koordynacja zakupów | 🎨 | S5 |
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
| Taktyka | Smoke za wcześnie / w próżnię | 🆕 | S11 |
| Taktyka | Flash: czas oślepienia wrogów, flashe w swoich, flash bez peeka | 🆕 | S11 |
| Taktyka | Molotov i HE bez efektu | 🆕 | S11 |
| Taktyka | Śmierć z niewykorzystanym utility | 🆕 | S11 |
| Taktyka | Baza lineupów per mapa i rozpoznawanie lineupów | 🆕 | S11 |
| Taktyka | Śmierć bez trade'u, brak trade'u kolegi | 🆕 | S12 |
| Taktyka | Rotacje (za wcześnie, na fejk) | 🆕 | S12 |
| Taktyka | Błędy ekonomii (force, brak dropu, śmierć z kasą) | 🆕 | S12 |
| Taktyka | Przewidywalna pozycja (ta sama pozycja wiele rund) | 🆕 | S12 |
| Taktyka | Entry, lurk, post-plant, retake, decyzje w clutchu | 🆕 | S12 |
| Raport | Raport „co poprawić” z priorytetami | 🆕 | S10 |
| Pro | Pipeline dem pro i normy pro per mapa/strona/sytuacja | 🆕 | S13 |
| Pro | Porównanie każdej metryki z pro i z rangą | 🆕 | S13 |
| Pro | Model szansy wygranej rundy, wpływ każdej decyzji | 🆕 | S14 |
| Pro | „Co zrobiłby pro” w podobnej sytuacji | 🆕 | S14 |
| Trener AI | Rady w ludzkim języku (Claude API), plan treningu, ćwiczenia | 🆕 | S15 |
| Trener AI | Ocena rad (przydatne / nie) i uczenie kolejności rad | 🆕 | S15 |
| Postęp | Trendy metryk w czasie, cele, odznaki | 🆕 | S16 |
| Społeczność | Publiczny profil, udostępnianie raportu | 🆕 | S16 |
| Drużyna | Dashboard drużyny, anti-strat przeciwnika, tablica taktyczna | 🆕 | S17 |
| Inne źródła | Premier/Steam (share code lub upload) dla chętnych | 🆕 | S18 |
| Platforma | PWA, powiadomienia „analiza gotowa”, PL/EN | 🆕 | S18 |
| Platforma | Storage R2, limity darmowego planu | 🆕 | S7 |

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

### S14. Model szansy wygranej i „co zrobiłby pro”
- **Wymaga:** S13.
- **Zakres:** osobna usługa w Pythonie (LightGBM/XGBoost) liczy szansę wygranej rundy z (żywi, HP, ekonomia, bomba, czas, pozycje, utility). Wpływ decyzji = zmiana szansy. Wyszukiwanie podobnych sytuacji w danych pro i pokazanie, co pro robili najczęściej, z klipem 2D.
- **Gotowe, gdy:** Finding pokazuje „kosztowało team X pp szansy na rundę”.

### S15. Trener AI
- **Wymaga:** S10 (lepiej po S13).
- **Zakres:** rady pisane przez Claude API wyłącznie na podstawie Findingów i liczb (bez wymyślania faktów), po polsku i angielsku. Plan treningu na tydzień (mapy Workshop, ćwiczenia, cele liczbowe). Ocena rad „przydatne / nie” i sortowanie rad według ocen.
- **Gotowe, gdy:** po analizie gracz dostaje plan treningu z celami.

### S16. Postęp i udostępnianie
- **Wymaga:** S10.
- **Zakres:** trendy metryk w czasie, cele (np. strzały w ruchu < 15%), odznaki, publiczny profil, udostępnianie raportu i momentu replaya linkiem, notatki na mapie.
- **Gotowe, gdy:** gracz widzi swój postęp w 10 ostatnich meczach.

### S17. Drużyna
- **Wymaga:** S12.
- **Zakres:** drużyny (model `Team` już jest), dashboard drużyny, anti-strat przeciwnika (defaulty, executes, retake), tablica taktyczna z zapisem.
- **Gotowe, gdy:** drużyna widzi wspólne statystyki i tendencje rywala.

### S18. Platforma
- **Wymaga:** S7.
- **Zakres:** Premier/Steam dla chętnych (share code lub upload), PWA (instalacja na telefonie), powiadomienia „analiza gotowa”, tłumaczenie PL/EN.
- **Gotowe, gdy:** aplikację da się zainstalować na telefonie i dostać powiadomienie.

## Kolejność

```
S1 → S2 → S3, S4, S5 (równolegle)
S6 (równolegle z S2–S5) → S7, S8
S8 → S9 → S13 → S14
S8 + S5 → S10 → S11, S12, S15, S16
S12 → S17 · S7 → S18
```
