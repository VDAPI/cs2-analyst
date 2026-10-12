import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { MapThumb, ResultBadge, resultColor, type MatchResult } from "@/components/match";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { formatDate, formatShortDate, weaponDisplayName } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import type { WeaponStat } from "@/components/charts/weapon-bar-chart";

/* ─── Helpers ───────────────────────────────────────────── */

/** Rating / K/D coloring used across the profile: ≥1.2 good, <0.8 weak. */
export function ratingClass(v: number): string {
  return v >= 1.2 ? "text-[var(--good)]" : v >= 0.8 ? "text-[var(--text-primary)]" : "text-[var(--mistake)]";
}

export const dash = (v: number | null, fmt: (n: number) => string) => (v === null ? "—" : fmt(v));

/** Polish plural: 1 → one, 2–4 (not 12–14) → few, else many. */
export function pluralPl(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}

/* ─── Layout pieces ─────────────────────────────────────── */

/** A titled block with an anchor id (offset so the sticky top bar doesn't cover it). */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="min-w-0 scroll-mt-20">
      <div className="mb-3">
        <h2 id={`${id}-title`} className="font-display text-lg font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Horizontally scrollable jump links to the profile's sections. */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="Sekcje profilu" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className="flex w-max gap-2">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-[rgba(190,160,255,0.04)] px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] md:min-h-9"
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Small label + mono value used inside side / buy-type cards. */
export function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0">
      <p className="label-overline truncate text-[var(--text-tertiary)]">{label}</p>
      <p className="stat-small mt-1 truncate text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

/** Card with a colored top border, an overline label and a big number. */
export function ValueCard({
  label,
  value,
  sub,
  color = "var(--accent)",
  valueClassName,
}: {
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  color?: string;
  valueClassName?: string;
}) {
  return (
    <Card className="border-t-2" style={{ borderTopColor: color }}>
      <p className="label-overline truncate text-[var(--text-tertiary)]">{label}</p>
      <p className={cn("stat-number mt-2 max-md:text-2xl", valueClassName ?? "text-[var(--text-primary)]")}>
        {value}
      </p>
      {sub && <p className="mt-1 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{sub}</p>}
    </Card>
  );
}

/* ─── Form ──────────────────────────────────────────────── */

export interface FormEntry {
  matchId: string;
  map: string;
  date: Date;
  result: MatchResult;
  rating: number;
  score: string;
}

/** Last matches, newest first: result pill, rating and map, each a link to the match. */
export function FormStrip({ entries }: { entries: FormEntry[] }) {
  return (
    <ol className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-5 lg:grid-cols-10">
      {entries.map((e) => (
        <li key={e.matchId} className="min-w-0">
          <Link
            href={`/matches/${e.matchId}`}
            title={`${mapDisplayName(e.map)} · ${formatDate(e.date)} · ${e.score}`}
            className="flex min-h-11 flex-col items-center gap-1 rounded-lg border border-[var(--border)] border-b-2 bg-[var(--surface-1)] px-1.5 py-2 text-center transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)]"
            style={{ borderBottomColor: resultColor(e.result) }}
          >
            <ResultBadge result={e.result} />
            <span className={cn("font-mono text-sm font-semibold tabular-nums", ratingClass(e.rating))}>
              {e.rating.toFixed(2)}
            </span>
            <span className="w-full truncate text-xs text-[var(--text-tertiary)]">{mapDisplayName(e.map)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/* ─── Sides & economy ───────────────────────────────────── */

export function SideCard({
  side,
  stats,
  kd,
  hsPct,
}: {
  side: "CT" | "T";
  stats: { kills: number; deaths: number; headshots: number };
  kd: number | null;
  hsPct: number | null;
}) {
  const color = side === "CT" ? "var(--ct-blue)" : "var(--t-gold)";
  return (
    <Card className="border-l-2" style={{ borderLeftColor: color }}>
      <div className="flex items-center gap-2">
        <Badge variant={side === "CT" ? "ct" : "t"}>{side}</Badge>
        <p className="font-display text-sm font-semibold text-[var(--text-primary)]">
          {side === "CT" ? "Strona CT" : "Strona T"}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 min-[400px]:grid-cols-4">
        <MiniStat label="K" value={stats.kills} />
        <MiniStat label="D" value={stats.deaths} />
        <MiniStat label="K/D" value={dash(kd, (n) => n.toFixed(2))} />
        <MiniStat label="HS%" value={dash(hsPct, (n) => `${n.toFixed(0)}%`)} />
      </div>
    </Card>
  );
}

export function BuyTypeCard({
  label,
  color,
  rounds,
  kd,
  adr,
  hsPct,
  winRate,
}: {
  label: string;
  color: string;
  rounds: number;
  kd: number | null;
  adr: number | null;
  hsPct: number | null;
  winRate: number | null;
}) {
  if (rounds === 0) {
    return (
      <Card className="border-t-2 opacity-50" style={{ borderTopColor: color }}>
        <p className="label-overline" style={{ color }}>
          {label}
        </p>
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">Brak rund</p>
      </Card>
    );
  }
  return (
    <Card className="border-t-2" style={{ borderTopColor: color }}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="label-overline truncate" style={{ color }}>
          {label}
        </p>
        <p className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]" title="Liczba rund">
          {rounds} {pluralPl(rounds, "runda", "rundy", "rund")}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2">
        <MiniStat label="K/D" value={dash(kd, (n) => n.toFixed(2))} />
        <MiniStat label="ADR" value={dash(adr, (n) => n.toFixed(0))} />
        <MiniStat label="HS%" value={dash(hsPct, (n) => `${n.toFixed(0)}%`)} />
        <MiniStat label="W%" value={dash(winRate, (n) => `${n.toFixed(0)}%`)} />
      </div>
    </Card>
  );
}

/* ─── Weapons ───────────────────────────────────────────── */

/** Same numbers as the chart tooltip, readable without hovering. */
export function WeaponTable({ data }: { data: WeaponStat[] }) {
  return (
    <div className="table-scroll rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Broń</th>
            <th scope="col">Zabójstwa</th>
            <th scope="col">HS</th>
            <th scope="col">HS%</th>
          </tr>
        </thead>
        <tbody>
          {data.map((w) => (
            <tr key={w.weapon}>
              <td className="font-medium text-[var(--text-primary)]">{w.displayName}</td>
              <td className="text-[var(--text-primary)]">{w.kills}</td>
              <td>{w.headshots}</td>
              <td>{w.kills > 0 ? `${w.hsPercent.toFixed(0)}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Tables ────────────────────────────────────────────── */

function MapCell({ map, href }: { map: string; href?: string }) {
  const name = <span className="truncate">{mapDisplayName(map)}</span>;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <MapThumb map={map} size="sm" />
      {href ? (
        <Link
          href={href}
          className="flex min-h-11 min-w-0 items-center font-medium text-[var(--text-primary)] hover:text-[var(--accent)] md:min-h-0"
        >
          {name}
        </Link>
      ) : (
        <span className="flex min-w-0 font-medium text-[var(--text-primary)]">{name}</span>
      )}
    </div>
  );
}

export interface MultiKillRow {
  count: number;
  weapons: string[];
  headshots: number;
  roundNumber: number;
  matchId: string;
  map: string;
  date: Date;
}

export function MultiKillTable({ rows }: { rows: MultiKillRow[] }) {
  return (
    <Card className="overflow-hidden p-0 md:p-0">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Mapa</th>
              <th scope="col">Data</th>
              <th scope="col">Runda</th>
              <th scope="col">Typ</th>
              <th scope="col" className="!text-left">Bronie</th>
              <th scope="col">HS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const type = r.count >= 5 ? "ace" : r.count === 4 ? "4k" : "3k";
              const uniqueWeapons = [...new Set(r.weapons)].map(weaponDisplayName).join(", ");
              return (
                <tr key={`${r.matchId}-${r.roundNumber}-${i}`}>
                  <td>
                    <MapCell map={r.map} href={`/matches/${r.matchId}`} />
                  </td>
                  <td className="text-[var(--text-tertiary)]">{formatDate(r.date)}</td>
                  <td>R{r.roundNumber}</td>
                  <td>
                    <Badge variant={type === "ace" ? "lime" : type === "4k" ? "default" : "neutral"}>
                      {type === "ace" ? "ACE" : type.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="!text-left text-xs">{uniqueWeapons}</td>
                  <td>
                    {r.headshots}/{r.count}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export interface MapRow {
  map: string;
  matches: number;
  winRate: number;
  kd: number;
  avgAdr: number;
  avgHltv: number;
}

export function MapTable({
  rows,
  bestMap,
  worstMap,
}: {
  rows: MapRow[];
  bestMap: string | null;
  worstMap: string | null;
}) {
  return (
    <Card className="overflow-hidden p-0 md:p-0">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Mapa</th>
              <th scope="col">Mecze</th>
              <th scope="col" title="Procent wygranych meczów">W%</th>
              <th scope="col">K/D</th>
              <th scope="col">ADR</th>
              <th scope="col" title="Średni rating HLTV">Rating</th>
              <th scope="col">
                <span className="sr-only">Ocena mapy</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.map}>
                <td>
                  <MapCell map={m.map} />
                </td>
                <td>{m.matches}</td>
                <td className="text-[var(--text-primary)]">{m.winRate.toFixed(0)}%</td>
                <td className="text-[var(--text-primary)]">{m.kd.toFixed(2)}</td>
                <td className="text-[var(--text-primary)]">{m.avgAdr.toFixed(1)}</td>
                <td className={cn("font-semibold", ratingClass(m.avgHltv))}>{m.avgHltv.toFixed(2)}</td>
                <td>
                  {m.map === bestMap && <Badge variant="success">Najlepsza</Badge>}
                  {m.map === worstMap && <Badge variant="error">Najsłabsza</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export interface HistoryRow {
  id: string;
  matchId: string;
  map: string;
  date: Date;
  result: MatchResult;
  teamScore: number;
  enemyScore: number;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  rating: number;
}

export function MatchHistoryTable({ rows }: { rows: HistoryRow[] }) {
  return (
    <Card className="overflow-hidden p-0 md:p-0">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Mapa</th>
              <th scope="col">Data</th>
              <th scope="col">Wynik</th>
              <th scope="col">Rundy</th>
              <th scope="col">K</th>
              <th scope="col">D</th>
              <th scope="col">A</th>
              <th scope="col">ADR</th>
              <th scope="col" title="Rating HLTV">Rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <MapCell map={r.map} href={`/matches/${r.matchId}`} />
                </td>
                <td className="text-[var(--text-tertiary)]">
                  <span className="sm:hidden">{formatShortDate(r.date)}</span>
                  <span className="max-sm:hidden">{formatDate(r.date)}</span>
                </td>
                <td>
                  <ResultBadge result={r.result} />
                </td>
                <td className="text-[var(--text-primary)]">
                  <span style={{ color: resultColor(r.result) }}>{r.teamScore}</span>:{r.enemyScore}
                </td>
                <td className="text-[var(--text-primary)]">{r.kills}</td>
                <td>{r.deaths}</td>
                <td>{r.assists}</td>
                <td className="text-[var(--text-primary)]">{r.adr.toFixed(1)}</td>
                <td className={cn("font-semibold", ratingClass(r.rating))}>{r.rating.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
