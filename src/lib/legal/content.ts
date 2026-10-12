/**
 * Privacy policy and terms of service (S29), in Polish and English. A draft
 * for the owner to review: the controller's details are placeholders in
 * square brackets until the owner fills them in. Keep it true to the code:
 * what is stored, where, for how long (CLAUDE.md, "Key Architectural
 * Decisions").
 */
import type { Locale } from "@/lib/i18n/config";

export const LEGAL_UPDATED = "2026-10-12";

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDoc {
  intro: string;
  sections: LegalSection[];
}

const CONTROLLER_PL = "[imię i nazwisko lub nazwa firmy, adres, e-mail kontaktowy — do uzupełnienia przez właściciela]";
const CONTROLLER_EN = "[name or company name, address, contact email — to be filled in by the owner]";

const PRIVACY_PL: LegalDoc = {
  intro:
    "CS2 Analyst analizuje dema z Counter-Strike 2 i pokazuje graczom ich błędy, statystyki i postępy. Ta polityka opisuje, jakie dane przetwarzamy, po co, jak długo i jakie masz prawa (RODO).",
  sections: [
    {
      title: "1. Administrator danych",
      paragraphs: [
        `Administratorem danych jest ${CONTROLLER_PL}. W sprawach danych osobowych pisz na ten adres.`,
      ],
    },
    {
      title: "2. Jakie dane przetwarzamy",
      bullets: [
        "Konto: adres e-mail, nazwa wyświetlana, hasło (tylko jako skrót bcrypt, nigdy jawnie), awatar, język, plan.",
        "Połączone konta (opcjonalnie): Steam ID, identyfikator i nick FACEIT, historia meczów FACEIT (mapa, wynik, data), kody udostępniania meczów Premier i, jeśli go podasz, kod uwierzytelniający historii meczów Steam.",
        "Dema i analizy: wgrane pliki .dem i wszystko, co z nich odczytujemy: nicki i Steam ID wszystkich graczy meczu, pozycje, strzały, obrażenia, granaty, ekonomia, oraz wyniki analizy (statystyki, błędy, raporty, dane do powtórki 2D).",
        "To, co tworzysz: cele, plany treningowe, notatki na mapie, oceny porad, oznaczone lineupy, publiczne linki i publiczny profil (jeśli go włączysz).",
        "Powiadomienia: powiadomienia w aplikacji i subskrypcje Web Push (adres usługi push przeglądarki).",
        "Dane techniczne: adres IP (do limitów zapytań, przechowywany w pamięci podręcznej najwyżej godzinę), logi serwera i, jeśli są włączone, raporty błędów.",
      ],
    },
    {
      title: "3. Cele i podstawy prawne",
      bullets: [
        "Świadczenie usługi (konto, analiza dem, raporty, powtórki, trener): wykonanie umowy, art. 6 ust. 1 lit. b RODO.",
        "Bezpieczeństwo i zapobieganie nadużyciom (limity zapytań, logi, raporty błędów): prawnie uzasadniony interes, art. 6 ust. 1 lit. f.",
        "Dane innych graczy z wgranych dem: prawnie uzasadniony interes analizy meczu, w którym grałeś; pokazujemy je tylko osobie, która wgrała demo, i tym, którym sama udostępni link.",
        "Normy „pro” i normy rang: zanonimizowane percentyle liczone z wyników graczy; prawnie uzasadniony interes porównania z innymi graczami.",
        "Funkcje opcjonalne (Steam, FACEIT, Premier, powiadomienia push, publiczny profil): Twoja zgoda, którą wycofasz, odłączając konto lub wyłączając funkcję w ustawieniach.",
      ],
    },
    {
      title: "4. Jak długo przechowujemy dane",
      bullets: [
        "Plik .dem usuwamy zaraz po analizie, chyba że zaznaczysz „zachowaj demo”. Raport i próbkowane dane do powtórki zostają w bazie.",
        "Dane konta i analizy trzymamy, dopóki masz konto. Usunięcie analizy usuwa mecz, raport i dane powtórki; zostaje tylko wpis o wgraniu (nazwa pliku, data), bo liczy się do miesięcznego limitu.",
        "Usunięcie konta usuwa od razu wszystkie dane powyżej, łącznie z demami. Kopie zapasowe bazy (jeśli są) nadpisują się w ich cyklu.",
        "Pamięć podręczna odpowiedzi API FACEIT (zwiad przeciwników) wygasa po kilku godzinach.",
      ],
    },
    {
      title: "5. Komu przekazujemy dane",
      bullets: [
        "Dostawcom infrastruktury: hosting serwera i bazy danych; Cloudflare R2 do przechowywania dem, jeśli jest włączone.",
        "Anthropic (Claude), jeśli włączony jest trener AI: wysyłamy liczby z Twojej analizy (bez e-maila i hasła), a model pisze z nich porady.",
        "Stripe, gdy kupujesz plan: e-mail, nazwa konta i dane płatności, które podajesz bezpośrednio Stripe (numeru karty nie widzimy). U nas zostaje status subskrypcji i lista faktur.",
        "Sentry, jeśli są włączone raporty błędów: dane techniczne błędu.",
        "Usługom push przeglądarki (np. Google, Mozilla, Apple): treść powiadomienia, gdy je włączysz.",
        "FACEIT i Steam: tylko zapytania, o które prosisz (połączenie konta, synchronizacja, pobranie dema, zwiad).",
        "Nie sprzedajemy danych i nie używamy reklam ani śledzenia.",
      ],
    },
    {
      title: "6. Pliki cookie",
      paragraphs: [
        "Używamy tylko niezbędnych plików cookie: sesji logowania, ochrony formularzy (CSRF), stanu łączenia konta FACEIT i wybranego języka. Nie używamy cookies analitycznych ani reklamowych, więc nie pytamy o zgodę.",
      ],
    },
    {
      title: "7. Twoje prawa",
      bullets: [
        "Dostęp i przenoszenie danych: w Ustawieniach → Prywatność i dane pobierzesz wszystkie swoje dane jako plik JSON.",
        "Usunięcie: w Ustawieniach → Prywatność i dane usuniesz konto i wszystkie dane jednym przyciskiem.",
        "Sprostowanie: nazwę, awatar i połączone konta zmienisz w Ustawieniach.",
        "Sprzeciw i ograniczenie przetwarzania: napisz do administratora. Jeśli jesteś graczem z cudzego dema i chcesz usunięcia swoich danych, napisz do nas.",
        "Skarga do organu nadzorczego: Prezes Urzędu Ochrony Danych Osobowych (uodo.gov.pl).",
      ],
    },
    {
      title: "8. Bezpieczeństwo",
      paragraphs: [
        "Hasła przechowujemy jako skróty bcrypt, połączenie jest szyfrowane (HTTPS), dostęp do danych meczów ma tylko osoba, która je wgrała, oraz posiadacze linków, które sama utworzyła i może w każdej chwili unieważnić. Ograniczamy liczbę zapytań i sprawdzamy wgrywane pliki.",
      ],
    },
    {
      title: "9. Zmiany polityki",
      paragraphs: ["O istotnych zmianach poinformujemy w aplikacji. Data ostatniej zmiany jest na górze strony."],
    },
  ],
};

const PRIVACY_EN: LegalDoc = {
  intro:
    "CS2 Analyst analyses Counter-Strike 2 demos and shows players their mistakes, stats and progress. This policy explains what data we process, why, for how long, and what your rights are (GDPR).",
  sections: [
    {
      title: "1. Data controller",
      paragraphs: [`The controller is ${CONTROLLER_EN}. Write to this address about your personal data.`],
    },
    {
      title: "2. What data we process",
      bullets: [
        "Account: email address, display name, password (only as a bcrypt hash, never in plain text), avatar, language, plan.",
        "Linked accounts (optional): Steam ID, FACEIT id and nickname, FACEIT match history (map, score, date), Premier share codes and, if you enter it, your Steam match history authentication code.",
        "Demos and analyses: uploaded .dem files and everything read from them: nicknames and Steam IDs of all players in the match, positions, shots, damage, grenades, economy, and the analysis results (stats, mistakes, reports, 2D replay data).",
        "What you create: goals, training plans, map notes, advice ratings, marked lineups, public links and a public profile (if you switch it on).",
        "Notifications: in-app notifications and Web Push subscriptions (your browser's push service address).",
        "Technical data: IP address (for rate limits, kept in a cache for at most an hour), server logs and, when enabled, error reports.",
      ],
    },
    {
      title: "3. Purposes and legal bases",
      bullets: [
        "Providing the service (account, demo analysis, reports, replays, coach): performance of a contract, Art. 6(1)(b) GDPR.",
        "Security and abuse prevention (rate limits, logs, error reports): legitimate interest, Art. 6(1)(f).",
        "Other players' data from uploaded demos: legitimate interest in analysing a match you played; shown only to the uploader and to whoever they share a link with.",
        "Pro and rank norms: anonymised percentiles computed from players' results; legitimate interest in comparing with other players.",
        "Optional features (Steam, FACEIT, Premier, push notifications, public profile): your consent, withdrawn by unlinking the account or switching the feature off in Settings.",
      ],
    },
    {
      title: "4. How long we keep data",
      bullets: [
        "The .dem file is deleted right after the analysis unless you tick \"keep demo\". The report and sampled replay data stay in the database.",
        "Account data and analyses are kept while you have an account. Deleting an analysis deletes the match, report and replay data; only the upload entry (file name, date) stays, because it counts towards the monthly limit.",
        "Deleting the account deletes all of the above at once, demos included. Database backups (if any) are overwritten in their cycle.",
        "Cached FACEIT API responses (opponent scouting) expire after a few hours.",
      ],
    },
    {
      title: "5. Who receives data",
      bullets: [
        "Infrastructure providers: server and database hosting; Cloudflare R2 for demo storage, when enabled.",
        "Anthropic (Claude), when the AI coach is enabled: we send the numbers from your analysis (no email or password) and the model writes advice from them.",
        "Stripe, when you buy a plan: email, account name and the payment details you give Stripe directly (we never see the card number). We keep the subscription status and the list of invoices.",
        "Sentry, when error reporting is enabled: technical error data.",
        "Browser push services (e.g. Google, Mozilla, Apple): the notification text, when you switch notifications on.",
        "FACEIT and Steam: only the requests you ask for (linking, sync, demo download, scouting).",
        "We do not sell data and use no ads or tracking.",
      ],
    },
    {
      title: "6. Cookies",
      paragraphs: [
        "We only use essential cookies: the login session, form protection (CSRF), FACEIT linking state and your chosen language. There are no analytics or advertising cookies, so there is no consent banner.",
      ],
    },
    {
      title: "7. Your rights",
      bullets: [
        "Access and portability: Settings → Privacy and data downloads all your data as a JSON file.",
        "Erasure: Settings → Privacy and data deletes the account and all data with one button.",
        "Rectification: change your name, avatar and linked accounts in Settings.",
        "Objection and restriction: write to the controller. If you appear in someone else's demo and want your data removed, write to us.",
        "Complaint to a supervisory authority: in Poland, the President of the Personal Data Protection Office (uodo.gov.pl).",
      ],
    },
    {
      title: "8. Security",
      paragraphs: [
        "Passwords are stored as bcrypt hashes, the connection is encrypted (HTTPS), and match data is visible only to the uploader and to holders of links the uploader created and can revoke at any time. Requests are rate-limited and uploaded files are checked.",
      ],
    },
    {
      title: "9. Changes",
      paragraphs: ["We announce material changes in the app. The date of the last change is at the top of the page."],
    },
  ],
};

const TERMS_PL: LegalDoc = {
  intro: "Regulamin określa zasady korzystania z CS2 Analyst. Zakładając konto, akceptujesz go.",
  sections: [
    {
      title: "1. Usługodawca",
      paragraphs: [`Usługę świadczy ${CONTROLLER_PL}.`],
    },
    {
      title: "2. Usługa",
      bullets: [
        "CS2 Analyst analizuje dema CS2 i pokazuje statystyki, błędy, powtórki 2D, porady i porównania z graczami pro.",
        "Plan darmowy ma miesięczny limit analiz. Plany Pro i Drużyna to subskrypcje miesięczne lub roczne z większymi limitami; aktualne ceny są w cenniku (/pricing).",
        "Płatności obsługuje Stripe. Subskrypcja odnawia się automatycznie, anulujesz ją w każdej chwili w panelu płatności i działa do końca opłaconego okresu. Fakturę wystawia Stripe po każdej płatności.",
        "Plan Drużyna daje limity Pro kolejnym członkom drużyny właściciela (według daty dołączenia), w liczbie podanej w cenniku.",
        "Analiza jest automatyczna i może zawierać błędy. Porady mają charakter treningowy.",
        "Projekt jest niezależny i nie jest związany z Valve Corporation ani FACEIT. Counter-Strike jest znakiem towarowym Valve Corporation.",
      ],
    },
    {
      title: "3. Konto",
      bullets: [
        "Musisz mieć ukończone 16 lat albo zgodę rodzica lub opiekuna.",
        "Dbasz o poufność hasła. Jedna osoba, jedno konto.",
        "Konto usuniesz w każdej chwili w Ustawieniach; razem z nim usuwamy wszystkie Twoje dane.",
      ],
    },
    {
      title: "4. Wgrywane dema i treści",
      bullets: [
        "Wgrywaj tylko dema, do których masz prawo (własne mecze, dema udostępnione publicznie przez organizatora lub Valve).",
        "Zachowujesz prawa do swoich treści. Udzielasz nam licencji w zakresie potrzebnym do analizy, przechowania wyników i pokazania ich Tobie oraz osobom, którym udostępnisz link.",
        "Wyniki analiz mogą w formie zanonimizowanej trafić do norm (percentyli) porównawczych.",
      ],
    },
    {
      title: "5. Zakazane działania",
      bullets: [
        "Obchodzenie limitów, automatyczne masowe zapytania, próby dostępu do cudzych danych lub zakłócania działania serwisu.",
        "Wgrywanie plików, które nie są demami CS2, lub treści naruszających prawo.",
        "Publikowanie przez publiczne linki treści naruszających prawa innych osób.",
      ],
    },
    {
      title: "6. Odpowiedzialność",
      paragraphs: [
        "Usługa jest dostarczana „tak jak jest”. Dokładamy starań o jej ciągłość i poprawność, ale nie gwarantujemy wyników w grze. Odpowiedzialność usługodawcy nie wyłącza praw konsumenta wynikających z przepisów powszechnie obowiązujących.",
      ],
    },
    {
      title: "7. Zawieszenie i zakończenie",
      paragraphs: [
        "Możemy zablokować konto, które łamie regulamin, po wcześniejszej informacji, chyba że naruszenie zagraża bezpieczeństwu serwisu lub innych użytkowników.",
      ],
    },
    {
      title: "8. Reklamacje i kontakt",
      paragraphs: [`Reklamacje i pytania wysyłaj na adres: ${CONTROLLER_PL}. Odpowiadamy w ciągu 14 dni.`],
    },
    {
      title: "9. Zmiany regulaminu",
      paragraphs: [
        "O zmianach informujemy w aplikacji co najmniej 14 dni wcześniej. Prawem właściwym jest prawo polskie.",
      ],
    },
  ],
};

const TERMS_EN: LegalDoc = {
  intro: "These terms set the rules for using CS2 Analyst. By creating an account you accept them.",
  sections: [
    { title: "1. Provider", paragraphs: [`The service is provided by ${CONTROLLER_EN}.`] },
    {
      title: "2. The service",
      bullets: [
        "CS2 Analyst analyses CS2 demos and shows stats, mistakes, 2D replays, advice and comparisons with pro players.",
        "The free plan has a monthly analysis limit. Pro and Team are monthly or yearly subscriptions with higher limits; current prices are on the pricing page (/pricing).",
        "Payments are handled by Stripe. A subscription renews automatically; cancel it any time in the billing portal and it runs to the end of the paid period. Stripe issues an invoice after every payment.",
        "The Team plan gives Pro limits to the next members of the owner's team (by join date), as many as the pricing page says.",
        "The analysis is automatic and may contain errors. Advice is meant for practice.",
        "This is an independent project, not affiliated with Valve Corporation or FACEIT. Counter-Strike is a trademark of Valve Corporation.",
      ],
    },
    {
      title: "3. Account",
      bullets: [
        "You must be at least 16, or have a parent's or guardian's consent.",
        "Keep your password confidential. One person, one account.",
        "You can delete the account at any time in Settings; all your data is deleted with it.",
      ],
    },
    {
      title: "4. Uploaded demos and content",
      bullets: [
        "Only upload demos you have the right to use (your own matches, demos published by the organiser or Valve).",
        "You keep the rights to your content. You grant us a licence to the extent needed to analyse it, store the results and show them to you and to people you share a link with.",
        "Analysis results may feed the comparison norms (percentiles) in anonymised form.",
      ],
    },
    {
      title: "5. Prohibited actions",
      bullets: [
        "Circumventing limits, automated mass requests, attempts to access other people's data or disrupt the service.",
        "Uploading files that are not CS2 demos, or unlawful content.",
        "Publishing content that infringes other people's rights through public links.",
      ],
    },
    {
      title: "6. Liability",
      paragraphs: [
        "The service is provided \"as is\". We work to keep it available and correct but do not guarantee in-game results. Nothing here limits consumer rights under mandatory law.",
      ],
    },
    {
      title: "7. Suspension and termination",
      paragraphs: [
        "We may block an account that breaks these terms after notice, unless the breach threatens the security of the service or other users.",
      ],
    },
    {
      title: "8. Complaints and contact",
      paragraphs: [`Send complaints and questions to: ${CONTROLLER_EN}. We reply within 14 days.`],
    },
    {
      title: "9. Changes",
      paragraphs: ["We announce changes in the app at least 14 days in advance. Polish law applies."],
    },
  ],
};

export function legalDoc(kind: "privacy" | "terms", locale: Locale): LegalDoc {
  if (kind === "privacy") return locale === "en" ? PRIVACY_EN : PRIVACY_PL;
  return locale === "en" ? TERMS_EN : TERMS_PL;
}
