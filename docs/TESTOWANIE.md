# Testowanie CS2 Analyst na własnym komputerze

Ta instrukcja prowadzi krok po kroku od czystego komputera do działającej aplikacji, którą otworzysz też na telefonie w tej samej sieci Wi-Fi. Nie musisz nic programować. Wszystko (aplikacja, analiza dem, baza danych, magazyn plików) działa w Dockerze i uruchamia się jednym poleceniem.

**W skrócie:** zainstaluj Docker Desktop, pobierz kod, w folderze projektu wpisz `docker compose up -d --build`, otwórz <http://localhost:3000> i zaloguj się jako `test@cs2analyst.local` z hasłem `test1234`.

## Spis treści

1. [Czego potrzebujesz](#1-czego-potrzebujesz)
2. [Pobranie kodu](#2-pobranie-kodu)
3. [Klucze API (opcjonalnie)](#3-klucze-api-opcjonalnie)
4. [Uruchomienie](#4-uruchomienie)
5. [Pierwsze logowanie](#5-pierwsze-logowanie)
6. [Telefon w tej samej sieci Wi-Fi](#6-telefon-w-tej-samej-sieci-wi-fi)
7. [Wgrywanie dem](#7-wgrywanie-dem)
8. [Konto administratora](#8-konto-administratora)
9. [Połączenie konta FACEIT (HTTPS)](#9-połączenie-konta-faceit-https)
10. [Płatności testowe (Stripe)](#10-płatności-testowe-stripe)
11. [Lista rzeczy do sprawdzenia](#11-lista-rzeczy-do-sprawdzenia)
12. [Codzienna obsługa](#12-codzienna-obsługa)
13. [Gdy coś nie działa](#13-gdy-coś-nie-działa)

## 1. Czego potrzebujesz

- Komputer z Windows 10/11 (64-bit) albo macOS (procesor Apple M1/M2/M3/M4 lub Intel).
- Około 8 GB wolnego RAM-u w trakcie pracy i 15 GB wolnego miejsca na dysku.
- **Docker Desktop**, do pobrania ze strony <https://www.docker.com/products/docker-desktop/>.
  - **Windows:** uruchom instalator z domyślnymi opcjami (zaznaczone „Use WSL 2”). Jeśli instalator poprosi o instalację WSL albo o restart, zgódź się. Po restarcie uruchom Docker Desktop i poczekaj, aż w lewym dolnym rogu pojawi się zielony napis „Engine running”.
  - **macOS:** pobierz wersję dla swojego procesora (Apple Silicon albo Intel; sprawdzisz w menu  → „Ten Mac”), przeciągnij Docker do Aplikacji, uruchom i poczekaj na „Engine running”.
- **Git** (do pobrania kodu i aktualizacji):
  - Windows: <https://git-scm.com/download/win> (domyślne opcje) albo GitHub Desktop: <https://desktop.github.com/>.
  - macOS: w Terminalu wpisz `git --version`; jeśli Gita nie ma, system sam zaproponuje instalację.

**Terminal**, czyli okno do wpisywania poleceń:

- Windows: menu Start → wpisz „PowerShell” → Enter.
- macOS: Spotlight (⌘ + spacja) → wpisz „Terminal” → Enter.

## 2. Pobranie kodu

W terminalu wpisz (repozytorium jest prywatne, więc Git może poprosić o zalogowanie do GitHuba):

```bash
git clone https://github.com/VDAPI/cs2-analyst.git
cd cs2-analyst
```

Z GitHub Desktop: „File → Clone repository” → `VDAPI/cs2-analyst`, a potem „Repository → Open in Command Prompt / Terminal”.

Wszystkie kolejne polecenia wpisujesz w tym folderze (`cs2-analyst`).

## 3. Klucze API (opcjonalnie)

Aplikacja działa bez żadnych kluczy: konto, wgrywanie dem, raport, replay 2D, mechanika, taktyka, granaty, heatmapy, ekonomia, postęp, porównania, panel admina. Klucze włączają dodatkowe funkcje:

| Zmienna | Co włącza | Skąd wziąć |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Teksty Trenera AI (plan tygodnia i karta „Trener AI” w raporcie). Bez klucza trener pokazuje standardowe rady. | <https://console.anthropic.com/> → API Keys |
| `FACEIT_API_KEY` | Scouting rywali, rangi z pokoju FACEIT, historia meczów FACEIT | <https://developers.faceit.com/> → App Studio → twoja aplikacja → API Keys (Server side) |
| `FACEIT_CLIENT_ID`, `FACEIT_CLIENT_SECRET` | Łączenie konta FACEIT w Ustawieniach (patrz [punkt 9](#9-połączenie-konta-faceit-https)) | ta sama aplikacja w FACEIT Developers → Authentication |
| `FACEIT_DOWNLOADS_API_KEY` | Pobieranie dem z FACEIT po kliknięciu „Analizuj zaznaczone” (bez klucza aplikacja kieruje do ręcznego uploadu) | FACEIT Developers, Downloads API |
| `STEAM_API_KEY` | Logowanie przez Steam i historia meczów Premier | <https://steamcommunity.com/dev/apikey> |
| `STRIPE_SECRET_KEY` | Testowe płatności za plan Pro i Drużyna (patrz [punkt 10](#10-płatności-testowe-stripe)). Tylko klucz testowy `sk_test_…`. | <https://dashboard.stripe.com/test/apikeys> |

Jak wpisać klucze:

1. Skopiuj plik `.env.example` jako `.env`:
   - Windows (PowerShell): `copy .env.example .env`
   - macOS: `cp .env.example .env`
2. Otwórz `.env` w Notatniku (Windows: `notepad .env`) albo w TextEdit (macOS: `open -e .env`).
3. Wpisz klucze po znaku `=`, bez cudzysłowów i spacji, np. `ANTHROPIC_API_KEY=sk-ant-...`. Linii z adresami baz (`DATABASE_URL`, `REDIS_URL` itp.) nie musisz zmieniać: Docker i tak ustawia własne.
4. Zapisz plik. Jeśli aplikacja już działa, uruchom ją ponownie: `docker compose up -d`.

Plik `.env` zostaje tylko na twoim komputerze (Git go pomija). Nie wysyłaj go nikomu.

## 4. Uruchomienie

```bash
docker compose up -d --build
```

Za pierwszym razem trwa to 5–15 minut (pobieranie i budowanie). Kolejne uruchomienia trwają kilkanaście sekund.

Sprawdź stan:

```bash
docker compose ps -a
```

Wszystko jest gotowe, gdy:

- `app` ma status `Up … (healthy)`,
- `setup` ma status `Exited (0)` (to jednorazowe przygotowanie, ma się zakończyć),
- `worker`, `worker-faceit`, `ml`, `postgres`, `redis`, `minio`, `https` mają `Up`.

Co uruchomił Docker:

| Usługa | Co robi |
| --- | --- |
| `app` | Aplikacja: <http://localhost:3000> |
| `worker` | Analiza dem (parser) i pobieranie dem Premier |
| `worker-faceit` | Pobieranie dem z FACEIT |
| `ml` | Trening modelu szansy wygranej rundy (Python, LightGBM); do 20 meczów działa model wyjściowy |
| `postgres` | Baza danych (raporty, dane replayów) |
| `redis` | Kolejka analiz |
| `minio` | Magazyn plików .dem (zamiennik Cloudflare R2), podgląd: <http://localhost:9001>, login `cs2analyst`, hasło `cs2analyst-minio` |
| `https` | Ta sama aplikacja po HTTPS: <https://localhost:3443>, potrzebna tylko do połączenia FACEIT |
| `setup` | Przy każdym starcie: aktualizuje schemat bazy, tworzy konto testowe z 3 przykładowymi analizami (tylko raz) i pobiera przykładowe demo |

## 5. Pierwsze logowanie

Otwórz <http://localhost:3000> i zaloguj się:

- e-mail: `test@cs2analyst.local`
- hasło: `test1234`

To konto ma już 3 przeanalizowane mecze na Mirage (wygrana, przegrana, wyrównany mecz), więc od razu zobaczysz raport, replay, mechanikę i resztę ekranów. Te przykładowe mecze są symulowane: liczby wyglądają realistycznie, ale nie pochodzą z prawdziwej gry. Konto testowe jest też administratorem.

Możesz też założyć własne konto przez „Zarejestruj się”. Adresy `@cs2analyst.local` są zarezerwowane, użyj zwykłego e-maila (nie jest weryfikowany).

## 6. Telefon w tej samej sieci Wi-Fi

1. Znajdź adres IP komputera w sieci domowej:
   - **Windows:** w PowerShell wpisz `ipconfig` i znajdź „Adres IPv4” w sekcji karty Wi-Fi (albo Ethernet, jeśli komputer jest na kablu), np. `192.168.1.23`.
   - **macOS:** w Terminalu wpisz `ipconfig getifaddr en0` (na kablu czasem `en1`).
2. Na telefonie (połączonym z tym samym Wi-Fi) otwórz przeglądarkę i wpisz `http://192.168.1.23:3000` (z twoim adresem). Wpisz `http://`, nie `https://`.
3. Zaloguj się tym samym kontem.

Jeśli telefon się nie łączy:

- **Windows:** przy pierwszym uruchomieniu Windows mógł zapytać o zgodę dla „Docker Desktop Backend” w Zaporze. Sprawdź „Zapora Windows Defender → Zezwalaj aplikacji na komunikację przez zaporę” i zaznacz Docker Desktop Backend dla sieci prywatnych. Sieć Wi-Fi musi mieć profil „Prywatna”: Ustawienia → Sieć i Internet → Wi-Fi → twoja sieć → „Typ profilu sieci: Prywatna”.
- **macOS:** jeśli zapora jest włączona (Ustawienia systemowe → Sieć → Zapora), zezwól na połączenia przychodzące dla Dockera.
- Sieć dla gości w routerze i część sieci publicznych blokuje połączenia między urządzeniami. Użyj zwykłej sieci domowej.

Na telefonie przez `http://` działa cała aplikacja oprócz rzeczy, które przeglądarka pozwala tylko na HTTPS: instalacja jako aplikacja (PWA), powiadomienia push i kopiowanie do schowka (przycisk pokaże wtedy link do skopiowania ręcznie). Na komputerze pod `http://localhost:3000` działają też one, bo przeglądarki traktują localhost jak bezpieczny adres.

## 7. Wgrywanie dem

**Przykładowe prawdziwe demo.** Przy pierwszym uruchomieniu `setup` pobiera prawdziwe demo CS2 (Mirage, 60 MB, demo testowe biblioteki demoparser2) do folderu `data/przyklad/de_mirage-przyklad.dem` w projekcie. Wejdź w „Wgraj demo”, przeciągnij ten plik i obserwuj kolejkę analiz. Analiza trwa zwykle od kilkunastu sekund do 2 minut.

**Twoje dema:**

- **FACEIT:** na stronie meczu (matchroom) kliknij „Watch demo”/„Pobierz demo”. Plik zwykle ma rozszerzenie `.dem.gz` albo `.dem.zst`; rozpakuj go (Windows: 7-Zip, <https://www.7-zip.org/>; macOS: dwuklik albo The Unarchiver) i wgraj plik `.dem`.
- **Premier / turniejowe:** w CS2 „Oglądaj → Twoje mecze” pobierz mecz. Pliki leżą w folderze gry: `…\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\replays` (macOS: CS2 nie działa natywnie, użyj dem z innego komputera albo z FACEIT).
- Możesz wgrać kilka plików naraz. Plik .dem jest kasowany po analizie (raport i replay zostają w bazie), chyba że zaznaczysz „Zachowaj demo”.

**Masz analizy sprzed 12.10.2026?** Mecze przeanalizowane przed poprawkami z audytu mają błędnych zwycięzców rund i ekonomię. Usuń je w „Biblioteka” i wgraj te dema jeszcze raz. (Dotyczy tylko bazy, w której analizowałeś je wcześniej; świeża instalacja z tej instrukcji jest czysta.)

**Dema pro do norm:** jako administrator wejdź w „Admin → Pro” (`/admin/pro`) i wgraj dema meczów zawodowych. Po analizie mediany „pro” w raportach liczą się z nich zamiast z wartości szacunkowych (≈).

## 8. Konto administratora

Panel admina jest pod <http://localhost:3000/admin> (przegląd, analizy, użytkownicy, dema pro). Konto testowe już jest administratorem. Żeby nadać uprawnienia swojemu kontu:

1. Zarejestruj się w aplikacji swoim e-mailem.
2. W terminalu, w folderze projektu:

   ```bash
   docker compose exec app npm run admin:grant -- twoj@email.pl
   ```

3. Odśwież stronę. Polecenie wypisze konto (id, data założenia), żebyś mógł sprawdzić, że to twoje.

## 9. Połączenie konta FACEIT (HTTPS)

FACEIT przyjmuje logowanie (OAuth) tylko na zarejestrowane adresy `https://`. Dlatego Docker udostępnia aplikację także pod <https://localhost:3443>. Jednorazowo:

1. Wpisz `FACEIT_CLIENT_ID`, `FACEIT_CLIENT_SECRET` i `FACEIT_API_KEY` w `.env` ([punkt 3](#3-klucze-api-opcjonalnie)) i uruchom `docker compose up -d`.
2. W <https://developers.faceit.com/> → App Studio → twoja aplikacja → Authentication → Redirect URLs dodaj:
   `https://localhost:3443/api/faceit/link/callback`
3. Otwórz <https://localhost:3443>. Przeglądarka ostrzeże o certyfikacie (jest lokalny, wystawiony przez Dockera). Chrome/Edge: „Zaawansowane” → „Przejdź do localhost”. Safari: „Pokaż szczegóły” → „odwiedź tę witrynę”. Firefox: „Zaawansowane” → „Akceptuję ryzyko”.
4. Zaloguj się, wejdź w „Ustawienia” i kliknij „Połącz FACEIT”.

Po połączeniu możesz wrócić na <http://localhost:3000> albo na telefon: konto zostaje połączone, a historia FACEIT, zaznaczanie meczów i scouting działają na każdym adresie.

## 10. Płatności testowe (Stripe)

Płatności działają w **trybie testowym** Stripe: nikt nie płaci prawdziwych pieniędzy. Aplikacja odrzuca klucz `sk_live_…` (prawdziwe płatności włącza się dopiero osobną zmienną przy starcie publicznym).

1. Załóż darmowe konto na <https://dashboard.stripe.com/register> (nie musisz podawać danych firmy, żeby używać trybu testowego).
2. Przełącz panel na „Test mode” (przełącznik w prawym górnym rogu), wejdź w „Developers” → „API keys” i skopiuj „Secret key” (`sk_test_…`).
3. Wpisz go w `.env` jako `STRIPE_SECRET_KEY=sk_test_...` ([punkt 3](#3-klucze-api-opcjonalnie)) i uruchom `docker compose up -d`.
4. Jednorazowo w panelu Stripe (tryb testowy): „Settings” → „Billing” → „Customer portal” → „Activate test link”. Bez tego przycisk „Zarządzaj subskrypcją” zwróci błąd.
5. W aplikacji wejdź w „Plan i płatności” (menu „Pro i drużyna” albo Ustawienia → „Plan i płatności”) i wybierz Pro lub Drużyna. Na stronie Stripe wpisz kartę testową `4242 4242 4242 4242`, dowolną przyszłą datę (np. 12/34), dowolny CVC i dowolne dane.
6. Po powrocie plan i limity zmieniają się od razu (aplikacja sama pyta Stripe o wynik). Faktura pojawi się na liście po kliknięciu „Odśwież status”.

Ceny produktów (Pro 6 USD/mies., Drużyna 15 USD/mies., rocznie 10 miesięcy) aplikacja zakłada w Stripe sama przy pierwszej płatności. Zmienia się je w jednym miejscu: `src/lib/billing/prices.ts`.

Inne karty testowe: `4000 0000 0000 9995` (odmowa, brak środków), `4000 0025 0000 3155` (wymaga potwierdzenia 3D Secure). Anulowanie: „Zarządzaj subskrypcją” → „Anuluj”; plan działa do końca opłaconego okresu.

Webhooki (opcjonalnie, dla programisty): bez nich wszystko działa, bo aplikacja synchronizuje się po powrocie ze Stripe i po „Odśwież status”. Żeby zmiany ze Stripe (np. anulowanie w panelu, odnowienie) przychodziły same, zainstaluj [Stripe CLI](https://docs.stripe.com/stripe-cli) i uruchom `stripe listen --forward-to localhost:3000/api/billing/webhook`, a wypisany sekret `whsec_…` wpisz w `.env` jako `STRIPE_WEBHOOK_SECRET`.

## 11. Lista rzeczy do sprawdzenia

Zaznaczaj po kolei, na komputerze i na telefonie. Jeśli coś wygląda źle, zrób zrzut ekranu i opisz, co kliknąłeś.

**Konto i nawigacja**

- [ ] Strona główna: animacja biegnących żołnierzy, sekcje, FAQ, przyciski
- [ ] „Zobacz przykład” na stronie głównej: pełny raport bez logowania (http://localhost:3000/demo), przewodnik po raporcie przy pierwszej wizycie
- [ ] Rejestracja nowego konta (ekran Mecze zaczyna od „Zacznij w trzech krokach”), wylogowanie, logowanie
- [ ] Menu boczne (komputer), szuflada i dolny pasek (telefon), żadna strona nie przewija się w bok
- [ ] Ustawienia: zmiana nazwy i avatara, język PL/EN

**Mecze i analiza**

- [ ] Lista meczów, biblioteka analiz, kolejka analiz
- [ ] Wgranie przykładowego dema z `data/przyklad`, postęp w kolejce, gotowa analiza
- [ ] Mecz: scoreboard, rundy, oś czasu, clutche, trade'y, multi-kille
- [ ] Raport (`Raport` przy meczu): przewodnik przy pierwszym raporcie (i z przycisku „Jak czytać raport”), 3 najważniejsze błędy, karty błędów z klipem 2D, „Ty vs pro”
- [ ] Replay 2D: odtwarzanie, przewijanie, zoom i przesuwanie palcami na telefonie, znaczniki błędów, notatki na mapie
- [ ] Mechanika: strzały w ruchu, counter-strafe, celowanie, reakcja, spray
- [ ] Granaty, lineupy (kopiowanie `setpos`), heatmapy, ekonomia
- [ ] Gracze, profil gracza, porównanie graczy

**Rozwój i trening**

- [ ] Postęp: trendy, cele, odznaki
- [ ] Trener AI: plan tygodnia (z `ANTHROPIC_API_KEY` teksty pisze AI), ocena rad kciukiem
- [ ] Normy pro (`/pro`) z filtrami mapy, strony i rangi
- [ ] Udostępnianie raportu linkiem i otwarcie linku w oknie prywatnym (bez logowania), profil publiczny

**FACEIT, Steam, powiadomienia**

- [ ] Połączenie FACEIT ([punkt 9](#9-połączenie-konta-faceit-https)), synchronizacja historii, zaznaczenie meczów i „Analizuj zaznaczone”
- [ ] Scouting: wklejenie linku do pokoju FACEIT, karta rywali i sugestia veto
- [ ] Premier (z `STEAM_API_KEY`): kod udostępniania meczu, synchronizacja
- [ ] Dzwonek powiadomień po zakończonej analizie

**Biblioteka i limity**

- [ ] „Zachowaj demo” i ręczne usunięcie pliku dema
- [ ] Usunięcie analizy
- [ ] Panel admina: przegląd, analizy (ponowienie nieudanej), użytkownicy (plan, rola, limit)

**Płatności (tryb testowy, [punkt 10](#10-płatności-testowe-stripe))**

- [ ] Cennik (http://localhost:3000/pricing): trzy plany, przełącznik miesięcznie / rocznie, telefon
- [ ] Zakup Pro kartą `4242 4242 4242 4242`: po powrocie plan Pro i wyższe limity w Ustawieniach
- [ ] „Zarządzaj subskrypcją”: zmiana karty, anulowanie, faktura w PDF
- [ ] Plan Drużyna u właściciela drużyny: członkowie drużyny widzą limity Pro w „Plan i płatności"

## 12. Codzienna obsługa

| Co chcesz zrobić | Polecenie |
| --- | --- |
| Zatrzymać aplikację (dane zostają) | `docker compose stop` |
| Uruchomić ponownie | `docker compose up -d` |
| Zaktualizować do najnowszej wersji | `git pull`, potem `docker compose up -d --build` |
| Zobaczyć, co się dzieje (logi) | `docker compose logs -f app worker` (wyjście: Ctrl+C) |
| Usunąć **wszystkie** dane i zacząć od zera | `docker compose down -v`, potem `docker compose up -d --build` |

Uwaga: `docker compose down -v` kasuje bazę, analizy i konta bez pytania. Zwykłe zatrzymanie to `docker compose stop`.

## 13. Gdy coś nie działa

- **„port is already allocated” przy starcie:** port 3000, 3443, 5432, 6379 albo 9001 zajmuje inny program (np. drugi Postgres albo `npm run dev`). Zamknij go, albo w `docker-compose.yml` zmień lewą liczbę w `ports`, np. `"3001:3000"`, i otwieraj <http://localhost:3001>.
- **`setup` ma `Exited (1)`:** zobacz `docker compose logs setup` i wklej końcówkę w wątku projektu.
- **Analiza wisi albo kończy się błędem:** `docker compose logs --tail 100 worker`. Bardzo duże dema (powyżej 300 MB) potrzebują więcej pamięci: w Docker Desktop → Settings → Resources ustaw co najmniej 6 GB.
- **Telefon pokazuje stronę, ale logowanie wraca do ekranu logowania:** upewnij się, że adres zaczyna się od `http://` (nie `https://`) i ma `:3000` na końcu.
- **Windows, budowanie trwa bardzo długo albo brakuje pamięci:** w Docker Desktop → Settings → Resources (lub plik `.wslconfig`) daj WSL co najmniej 6 GB RAM.
- **Po `git pull` coś wygląda staro:** zawsze buduj ponownie: `docker compose up -d --build`.

## Dla programistów

- Środowisko jest w `Dockerfile` (jeden obraz dla aplikacji, workerów i setupu) i `docker-compose.yml`. `npm run setup:local` (schemat + `scripts/local-seed.ts`) działa też bez Dockera, z adresami z `.env`.
- Praca nad kodem z `npm run dev`: uruchom tylko bazy, `docker compose up -d postgres redis`.
- Dema trafiają do MinIO przez klienta R2 (`R2_ENDPOINT=http://minio:9000`, `R2_REGION=us-east-1`). Oficjalny obraz `minio/minio` zniknął z Docker Huba, więc używamy `pgsty/minio` (wspólnotowa kontynuacja tego samego serwera).
- Logowanie działa jednocześnie na `http://localhost:3000`, `http://<IP>:3000` i `https://localhost:3443` dzięki `AUTH_TRUST_HOST=true` (NextAuth bierze adres z zapytania) i middleware, które czyta ciasteczko sesji pod nazwą z `http` albo `https`.
- Test dymny całości: `docker compose up -d --build && bash scripts/local-smoke.sh` (CI uruchamia go w `.github/workflows/local-env.yml`).
