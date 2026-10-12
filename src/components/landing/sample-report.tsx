import { FindingTag, Badge } from "@/components/ui";

/** Static preview of a match report on the homepage. All numbers are example data. */

const tiles = [
  {
    label: "Strzały w ruchu",
    value: "38%",
    color: "var(--mistake)",
    fill: 38,
    note: "pro: ok. 9% · cel: poniżej 15%",
  },
  {
    label: "Czas counter-strafe",
    value: "118 ms",
    color: "var(--warning)",
    fill: 62,
    note: "pro: ok. 80 ms",
  },
  {
    label: "Crosshair placement",
    value: "4.1°",
    color: "var(--good)",
    fill: 78,
    note: "lepiej niż 70% graczy na Twoim poziomie",
  },
];

export function SampleReport() {
  return (
    <div className="grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[var(--shadow-lg)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label-overline text-[var(--accent)]">Raport · Mirage 13:9 · Mechanika</span>
        <Badge variant="neutral">Dane przykładowe</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="grid gap-1.5 rounded-xl bg-[var(--surface-2)] p-4">
            <span className="text-xs text-[var(--text-secondary)]">{t.label}</span>
            <span className="font-mono text-2xl font-semibold tabular-nums" style={{ color: t.color }}>
              {t.value}
            </span>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--canvas)]">
              <div className="h-full rounded-full" style={{ width: `${t.fill}%`, background: t.color }} />
            </div>
            <span className="text-xs text-[var(--text-tertiary)]">{t.note}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <article className="grid content-start gap-3 rounded-xl border border-[var(--border)] bg-[linear-gradient(180deg,var(--mistake-muted),transparent_60%)] p-4">
          <div className="flex flex-wrap gap-2">
            <FindingTag severity="high">Błąd taktyczny</FindingTag>
            <Badge variant="ct">
              CT · runda 7 · <span className="font-mono">1:45</span>
            </Badge>
          </div>
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            Smoke na A main za wcześnie
          </h3>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            Rzuciłeś smoke 10 sekund po starcie rundy. Nikt z T nie był w pobliżu, nie miałeś info z
            dźwięku ani od teamu, a nikt z Twojej drużyny go nie wykorzystał.
          </p>
          <p className="border-l-2 border-[var(--accent-2)] pl-3 text-sm leading-relaxed text-[var(--text-primary)]">
            Zachowaj smoke na opóźnienie wejścia albo na retake. Pro na tej pozycji rzucają go średnio
            przy <span className="font-mono">1:15</span>, po pierwszym kontakcie.
          </p>
        </article>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-2">
          <svg
            viewBox="0 0 320 240"
            role="img"
            aria-label="Podgląd 2D: smoke na A main, przeciwnicy daleko"
            className="block h-auto w-full"
          >
            <rect x="0" y="0" width="320" height="240" rx="8" fill="var(--surface-1)" />
            <path
              d="M30 40 H150 V90 H220 V40 H290 V200 H200 V150 H120 V200 H30 Z"
              fill="var(--surface-2)"
              stroke="var(--border-hover)"
            />
            <circle
              cx="250"
              cy="70"
              r="22"
              fill="var(--smoke)"
              fillOpacity="0.3"
              stroke="var(--smoke)"
              strokeDasharray="3 3"
            />
            <text x="250" y="104" textAnchor="middle" fontSize="10" fill="var(--text-secondary)" className="font-mono">
              smoke 1:45
            </text>
            <path d="M180 170 Q215 110 250 70" fill="none" stroke="var(--accent-2)" strokeWidth="1.5" strokeDasharray="4 3" />
            <circle cx="180" cy="170" r="7" fill="var(--ct-blue)" stroke="var(--accent-2)" strokeWidth="2" />
            <circle cx="220" cy="185" r="6" fill="var(--ct-blue)" />
            <circle cx="270" cy="160" r="6" fill="var(--ct-blue)" />
            <circle cx="60" cy="60" r="6" fill="var(--t-gold)" />
            <circle cx="75" cy="75" r="6" fill="var(--t-gold)" />
            <circle cx="55" cy="180" r="6" fill="var(--t-gold)" />
            <text x="16" y="228" fontSize="10" fill="var(--text-tertiary)" className="font-mono">
              najbliższy T: 1840 j. od smoke&apos;a
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}
