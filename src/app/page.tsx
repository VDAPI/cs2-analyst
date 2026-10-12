import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  BarChart3,
  Bot,
  Crosshair,
  DollarSign,
  Flame,
  GitCompare,
  Gauge,
  Link2,
  ListChecks,
  Play,
  Plug,
  ShieldCheck,
  Swords,
  Target,
  Trophy,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { authOptions } from "@/lib/auth";
import { PLAN_LIMITS } from "@/lib/limits";
import { Badge, buttonVariants } from "@/components/ui";
import { HeroRunners } from "@/components/landing/hero-runners";
import { SampleReport } from "@/components/landing/sample-report";
import { cn } from "@/lib/utils/cn";

const FREE_DEMOS = PLAN_LIMITS.FREE.monthlyDemos;

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const signedIn = Boolean(session?.user);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[var(--canvas)] text-[var(--text-primary)]">
      <LandingHeader signedIn={signedIn} />

      <main>
        {/* Hero */}
        <section
          aria-labelledby="hero-title"
          className="relative isolate flex min-h-[640px] items-end overflow-hidden border-b border-[var(--border)] bg-[radial-gradient(120%_90%_at_70%_10%,rgba(155,107,255,0.16),var(--canvas)_70%)] md:min-h-[calc(100dvh-64px)] md:items-center"
        >
          <HeroRunners className="absolute inset-0 -z-20 block h-full w-full" />
          {/* Keeps the copy readable over the runners: bottom fade on phones, left fade on desktop. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,var(--canvas)_42%,rgba(8,7,13,0.6)_62%,transparent_80%)] md:bg-[linear-gradient(90deg,var(--canvas)_8%,rgba(8,7,13,0.82)_38%,transparent_68%)]"
          />
          <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-56 sm:px-6 md:py-24">
            <div className="grid max-w-xl gap-5">
              <span className="label-overline text-[var(--accent)]">
                Analiza dem CS2 · FACEIT · Premier
              </span>
              <h1
                id="hero-title"
                className="font-display text-[2.4rem] font-bold leading-[1.02] tracking-tight sm:text-5xl md:text-6xl"
              >
                Zobacz, co{" "}
                <em className="not-italic text-[var(--accent)] [text-shadow:0_0_24px_var(--accent-glow)]">
                  psuje
                </em>{" "}
                Twoją grę.
              </h1>
              <p className="text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
                Wybierz mecze z FACEIT albo wgraj dowolne demo. Dostaniesz konkretne błędy z momentem w
                rundzie, podglądem 2D i radą, jak grać lepiej, porównaną z grą pro.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/settings" className={buttonVariants({ variant: "cta", size: "lg" })}>
                  <Link2 aria-hidden className="h-4 w-4" />
                  Połącz FACEIT
                </Link>
                <Link href="/upload" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                  <Upload aria-hidden className="h-4 w-4" />
                  Wgraj demo
                </Link>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--text-tertiary)]">
                <li className="flex items-center gap-1.5">
                  <ShieldCheck aria-hidden className="h-4 w-4 text-[var(--good)]" />
                  Demo kasujemy po analizie
                </li>
                <li className="flex items-center gap-1.5">
                  <Gauge aria-hidden className="h-4 w-4 text-[var(--accent-2)]" />
                  <span>
                    <span className="font-mono text-[var(--text-secondary)]">{FREE_DEMOS}</span> analiz
                    miesięcznie za darmo
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* How it works */}
        <Section id="jak-to-dziala" overline="Jak to działa" title="Trzy kroki do raportu">
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.title}
                  className="relative grid content-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-muted)]">
                      <Icon aria-hidden className="h-5 w-5 text-[var(--accent)]" />
                    </span>
                    <span className="font-mono text-sm text-[var(--text-tertiary)]">0{i + 1}</span>
                  </div>
                  <h3 className="font-display text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{step.text}</p>
                </li>
              );
            })}
          </ol>
        </Section>

        {/* Sample report */}
        <Section
          id="przykladowy-raport"
          overline="Przykładowy raport"
          title="Każdy błąd z momentem, podglądem i radą"
          lede="Oceniamy decyzje po tym, co mogłeś wiedzieć: dźwięk, widoczność i info od teamu, a nie po widoku z góry, którego w grze nie masz."
        >
          <SampleReport />
        </Section>

        {/* Features */}
        <Section id="funkcje" overline="Funkcje" title="Wszystko, czego potrzebujesz, żeby grać lepiej">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group grid content-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 transition-colors duration-150 hover:border-[var(--border-hover)]"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-muted)] transition-colors duration-150 group-hover:bg-[rgba(155,107,255,0.22)]">
                      <Icon aria-hidden className="h-5 w-5 text-[var(--accent)]" />
                    </span>
                    {f.soon && <Badge variant="neutral">Wkrótce</Badge>}
                  </div>
                  <h3 className="text-base font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{f.description}</p>
                </div>
              );
            })}
          </div>
        </Section>

        {/* FAQ */}
        <Section id="faq" overline="FAQ" title="Częste pytania">
          <div className="mx-auto grid max-w-3xl gap-3">
            {faq.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-[var(--border)] bg-[var(--surface-1)] open:border-[var(--border-hover)]"
              >
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden
                    className="font-mono text-lg text-[var(--accent)] transition-transform duration-150 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-[var(--text-secondary)]">{item.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* Final CTA */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="relative mx-auto grid max-w-6xl gap-6 overflow-hidden rounded-2xl border border-[var(--border-active)] bg-[radial-gradient(90%_140%_at_100%_0%,rgba(155,107,255,0.22),var(--surface-1)_60%)] p-6 sm:p-10 md:grid-cols-[1fr_auto] md:items-center">
            <div className="grid gap-2">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">Sprawdź swój ostatni mecz</h2>
              <p className="text-[var(--text-secondary)]">
                Połącz FACEIT i zaznacz mecze do analizy albo wgraj plik .dem z dowolnego źródła.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/settings" className={buttonVariants({ variant: "primary", size: "lg" })}>
                <Link2 aria-hidden className="h-4 w-4" />
                Połącz FACEIT
              </Link>
              <Link href="/upload" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                <Upload aria-hidden className="h-4 w-4" />
                Wgraj demo
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)] sm:px-6">
        <p>CS2 Analyst &copy; {new Date().getFullYear()} · Projekt niezależny, niezwiązany z Valve Corporation ani FACEIT.</p>
        <nav aria-label="Dokumenty" className="mt-3 flex justify-center gap-4">
          <Link href="/privacy" className="hover:text-[var(--text-primary)]">Polityka prywatności</Link>
          <Link href="/terms" className="hover:text-[var(--text-primary)]">Regulamin</Link>
        </nav>
      </footer>
    </div>
  );
}

function LandingHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--glass-bg)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="CS2 Analyst, strona główna" className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] shadow-[0_0_16px_var(--accent-glow)]">
            <Crosshair aria-hidden className="h-4 w-4 text-[var(--on-accent)]" strokeWidth={2.5} />
          </span>
          <span className="truncate font-display text-base font-bold tracking-wide">
            CS2 <span className="text-[var(--accent-2)]">Analyst</span>
          </span>
        </Link>
        <nav aria-label="Sekcje strony" className="hidden items-center gap-6 text-sm text-[var(--text-secondary)] md:flex">
          <a href="#jak-to-dziala" className="hover:text-[var(--text-primary)]">Jak to działa</a>
          <a href="#przykladowy-raport" className="hover:text-[var(--text-primary)]">Raport</a>
          <a href="#funkcje" className="hover:text-[var(--text-primary)]">Funkcje</a>
          <a href="#faq" className="hover:text-[var(--text-primary)]">FAQ</a>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          {signedIn ? (
            <Link href="/matches" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Moje mecze
            </Link>
          ) : (
            <>
              <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-md:px-2")}>
                Zaloguj
              </Link>
              <Link href="/register" className={buttonVariants({ variant: "primary", size: "sm" })}>
                Załóż konto
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Section({
  id,
  overline,
  title,
  lede,
  children,
}: {
  id: string;
  overline: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-10 grid max-w-2xl gap-3 text-center">
          <span className="label-overline text-[var(--accent)]">{overline}</span>
          <h2 id={`${id}-title`} className="font-display text-2xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h2>
          {lede && <p className="text-[var(--text-secondary)]">{lede}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

const steps: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Link2,
    title: "Połącz FACEIT albo wgraj demo",
    text: "Zaznacz mecze z historii FACEIT albo wrzuć pliki .dem z Premiera, FACEIT czy dowolnego serwera. Nic nie pobieramy bez Twojej zgody.",
  },
  {
    icon: ListChecks,
    title: "Analiza w kolejce",
    text: "Parsujemy demo, liczymy statystyki, mechanikę i aim, zapisujemy dane do replaya, a plik .dem kasujemy. Status widzisz w kolejce analiz.",
  },
  {
    icon: Target,
    title: "Raport z błędami",
    text: "Każdy błąd ma moment w rundzie, podgląd 2D, jedną konkretną radę i porównanie z tym, jak grają pro.",
  },
];

const features: { icon: LucideIcon; title: string; description: string; soon?: boolean }[] = [
  {
    icon: BarChart3,
    title: "Statystyki graczy",
    description: "K/D, ADR, rating HLTV 2.1, HS%, obrażenia z utility, opening duels. Wszystko z dema, automatycznie.",
  },
  {
    icon: Gauge,
    title: "Mechanika i aim",
    description: "Strzały w ruchu, counter-strafe, celność pierwszej kuli, crosshair placement, czas reakcji, spray i peeki.",
  },
  {
    icon: Play,
    title: "Replay 2D",
    description: "Widok z góry z pozycjami graczy, granatami i osią czasu rundy. Działa też po skasowaniu dema.",
  },
  {
    icon: Flame,
    title: "Heatmapy",
    description: "Miejsca zabójstw, śmierci i pozycji na radarze mapy, osobno dla CT i T.",
  },
  {
    icon: Crosshair,
    title: "Granaty",
    description: "Trajektorie smoke'ów, flashy, molotovów i HE z oceną, czy utility coś dało.",
  },
  {
    icon: DollarSign,
    title: "Ekonomia",
    description: "Wykres ekonomii runda po rundzie: typy zakupów, wartość sprzętu i zarządzanie kasą.",
  },
  {
    icon: Swords,
    title: "Clutche, trade'y, multi-kille",
    description: "Każdy clutch, trade i multi-kill w meczu, z rundą i wynikiem.",
  },
  {
    icon: GitCompare,
    title: "Porównanie graczy",
    description: "Radar, statystyki obok siebie, head-to-head, mapy i forma z wielu meczów.",
  },
  {
    icon: Plug,
    title: "FACEIT i Steam",
    description: "Synchronizacja historii FACEIT, logowanie emailem albo przez Steam.",
  },
  {
    icon: Bot,
    title: "Trener AI",
    description: "Podsumowanie meczu i plan treningu na podstawie Twoich powtarzających się błędów.",
    soon: true,
  },
  {
    icon: Trophy,
    title: "Porównanie z pro",
    description: "Normy z dem profesjonalnych: timingi utility, pozycje i decyzje na Twojej pozycji.",
    soon: true,
  },
  {
    icon: Users,
    title: "Drużyna",
    description: "Wspólne analizy dla całego składu, trendy drużyny i przygotowanie do przeciwnika.",
    soon: true,
  },
];

const faq: { q: string; a: string }[] = [
  {
    q: "Jakie dema mogę wgrać?",
    a: "Dowolne dema CS2 w formacie .dem: z FACEIT, Premiera, matchmakingu albo własnego serwera.",
  },
  {
    q: "Czy pobieracie moje dema z FACEIT automatycznie?",
    a: "Nie. Demo z FACEIT pobieramy tylko wtedy, gdy sam zaznaczysz mecz i klikniesz analizę. Nic nie dzieje się w tle.",
  },
  {
    q: "Co dzieje się z plikiem .dem po analizie?",
    a: "Kasujemy go. W bazie zostaje raport i próbkowane dane do replaya 2D. Jeśli chcesz zachować plik, oznacz mecz jako „zachowaj demo”.",
  },
  {
    q: "Ile to kosztuje?",
    a: `Na start jest darmowe z limitem ${FREE_DEMOS} analiz miesięcznie. Płatne plany z większym limitem pojawią się później.`,
  },
  {
    q: "Skąd wiecie, co powinienem był zrobić?",
    a: "Oceniamy decyzje po tym, co mogłeś wiedzieć w danym momencie: co było słychać, co widziałeś i co wiedział Twój team. Nie po widoku z góry, którego w grze nie masz.",
  },
  {
    q: "Czy działa na telefonie?",
    a: "Tak. Raporty, replay i wszystkie ekrany działają na telefonie od 360 px szerokości.",
  },
];
