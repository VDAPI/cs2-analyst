"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertCircle, Ban, ExternalLink, Loader2, Search, Swords, Target } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input, SectionTitle, UserAvatar } from "@/components/ui";
import { MapThumb } from "@/components/match";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import {
  suggestVeto,
  teamExtremes,
  type Faction,
  type ScoutPlayer,
  type ScoutReport,
  type ScoutTeam,
  type TeamMapStrength,
} from "@/lib/scouting/analysis";

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const fixed = (x: number | null, digits = 2) => (x === null ? "—" : x.toFixed(digits));
const pp = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))} pp`;

const STATUS_LABEL: Record<string, string> = {
  VOTING: "Trwa veto",
  CONFIGURING: "Konfiguracja serwera",
  READY: "Gotowy do startu",
  ONGOING: "W trakcie",
  FINISHED: "Zakończony",
  CANCELLED: "Anulowany",
};

/** Paste a room link → both rosters, map strengths and a veto plan. */
export function ScoutingView({ initialRoom }: { initialRoom: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [input, setInput] = useState(initialRoom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ScoutReport | null>(null);
  const [mine, setMine] = useState<Faction>("faction1");
  const [weStart, setWeStart] = useState(true);
  const started = useRef(false);

  const scout = useCallback(
    async (room: string) => {
      if (!room.trim()) return;
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/scouting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room }),
        });
        const data = (await res.json().catch(() => null)) as (ScoutReport & { error?: string }) | null;
        if (!res.ok || !data || data.error) {
          setError(data?.error ?? "Nie udało się pobrać danych z FACEIT.");
          return;
        }
        setReport(data);
        setMine(data.myFaction ?? "faction1");
        router.replace(`${pathname}?room=${encodeURIComponent(data.matchId)}`, { scroll: false });
      } catch {
        setError("Brak połączenia. Spróbuj ponownie.");
      } finally {
        setBusy(false);
      }
    },
    [pathname, router]
  );

  // A shared /scouting?room=… link scouts straight away.
  useEffect(() => {
    if (initialRoom && !started.current) {
      started.current = true;
      void scout(initialRoom);
    }
  }, [initialRoom, scout]);

  return (
    <div className="space-y-6">
      <Card>
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void scout(input);
          }}
        >
          <label htmlFor="room" className="sr-only">
            Link do pokoju FACEIT
          </label>
          <Input
            id="room"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://www.faceit.com/pl/cs2/room/1-…"
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
          />
          <Button type="submit" variant="cta" disabled={busy || !input.trim()} className="shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
            {busy ? "Sprawdzam graczy…" : "Skautuj"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          Link skopiujesz z paska adresu pokoju meczu na FACEIT. Działa w trakcie veto, w trakcie meczu i po nim.
        </p>
        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-[var(--mistake)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </Card>

      {busy && !report && <LoadingCard />}

      {report && (
        <Report
          report={report}
          mine={mine}
          onMine={setMine}
          weStart={weStart}
          onWeStart={setWeStart}
          refreshing={busy}
        />
      )}
    </div>
  );
}

function LoadingCard() {
  return (
    <Card aria-live="polite" className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
      <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" aria-hidden />
      Pobieram profile, statystyki map i ostatnie mecze 10 graczy…
    </Card>
  );
}

function Segmented<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="label-overline mb-1.5 text-[var(--text-tertiary)]">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 max-w-full truncate rounded-lg border px-3 text-sm font-semibold transition-colors md:min-h-9",
              o.value === value
                ? "border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                : "border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--border-hover)] hover:text-[var(--text-secondary)]"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Report({
  report,
  mine,
  onMine,
  weStart,
  onWeStart,
  refreshing,
}: {
  report: ScoutReport;
  mine: Faction;
  onMine: (f: Faction) => void;
  weStart: boolean;
  onWeStart: (v: boolean) => void;
  refreshing: boolean;
}) {
  const us = report.teams.find((t) => t.faction === mine)!;
  const them = report.teams.find((t) => t.faction !== mine)!;
  const veto = useMemo(() => suggestVeto(us, them, weStart), [us, them, weStart]);
  const opp = useMemo(() => teamExtremes(them), [them]);
  const missingStats = report.teams.flatMap((t) => t.players).filter((p) => !p.hasStats);

  return (
    <div className={cn("space-y-6 transition-opacity", refreshing && "opacity-60")}>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label-overline text-[var(--accent)]">{report.competition ?? "Mecz FACEIT"}</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-[var(--text-primary)]">
              <span className="break-words">{report.teams[0].name}</span>
              <span className="mx-2 text-[var(--text-tertiary)]">vs</span>
              <span className="break-words">{report.teams[1].name}</span>
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
              <Badge variant={report.status === "FINISHED" ? "neutral" : "lime"}>
                {STATUS_LABEL[report.status] ?? report.status}
              </Badge>
              {report.pickedMap && <Badge variant="default">Mapa: {mapDisplayName(report.pickedMap)}</Badge>}
              <span>Dane z {formatDateTime(report.fetchedAt)}</span>
            </div>
          </div>
          {report.faceitUrl && (
            <a
              href={report.faceitUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm text-[var(--accent-hover)] hover:underline md:min-h-0"
            >
              Pokój na FACEIT
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          <Segmented
            label={report.myFaction ? "Twoja drużyna" : "Którą drużyną grasz?"}
            value={mine}
            onChange={onMine}
            options={report.teams.map((t) => ({ value: t.faction, label: t.name }))}
          />
          <Segmented
            label="Kto banuje pierwszy"
            value={weStart}
            onChange={onWeStart}
            options={[
              { value: true, label: "My" },
              { value: false, label: "Rywale" },
            ]}
          />
        </div>
        {!report.myFaction && (
          <p className="mt-3 text-xs text-[var(--text-tertiary)]">
            Nie ma Cię w tym pokoju (albo konto FACEIT nie jest połączone), więc wybierz stronę ręcznie.
          </p>
        )}
        {missingStats.length > 0 && (
          <p className="mt-3 text-xs text-[var(--warning)]">
            Brak statystyk CS2 dla: {missingStats.map((p) => p.nickname).join(", ")}. Liczymy drużynę bez nich.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <VetoCard veto={veto} pickedMap={report.pickedMap} />
        <OpponentCard team={them} strongest={opp.strongest} weakest={opp.weakest} />
      </div>

      <MapTable us={us} them={them} ranking={veto.ranking.map((r) => r.map)} />

      <div className="grid gap-4 xl:grid-cols-2">
        <TeamCard team={us} title={`Twoja drużyna: ${us.name}`} accent="ours" />
        <TeamCard team={them} title={`Rywale: ${them.name}`} accent="theirs" />
      </div>

      <p className="text-xs text-[var(--text-tertiary)]">
        Siła mapy to winrate graczy na tej mapie ściągnięty w stronę ich ogólnego winrate (mało meczów = mało pewności),
        z większą wagą ostatnich 20 meczów i karą za mapy, których drużyna prawie nie gra. Sugestia zakłada, że rywale
        banują mapę najlepszą dla Was.
      </p>
    </div>
  );
}

function VetoCard({
  veto,
  pickedMap,
}: {
  veto: ReturnType<typeof suggestVeto>;
  pickedMap: string | null;
}) {
  const maxAbs = Math.max(0.05, ...veto.ranking.map((r) => Math.abs(r.advantage)));
  return (
    <Card className="border-[var(--accent-2-muted)]">
      <CardHeader
        title="Sugestia veto"
        description="Mapy od najlepszej dla Was do najgorszej."
      />
      {veto.predicted && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-[var(--accent-2-muted)] p-3">
          <MapThumb map={veto.predicted} size="lg" />
          <div className="min-w-0">
            <p className="label-overline text-[var(--accent-2)]">Prawdopodobna mapa</p>
            <p className="font-display text-xl font-semibold text-[var(--text-primary)]">
              {mapDisplayName(veto.predicted)}
            </p>
            {pickedMap && pickedMap !== veto.predicted && (
              <p className="text-xs text-[var(--text-tertiary)]">Veto wybrało {mapDisplayName(pickedMap)}.</p>
            )}
          </div>
        </div>
      )}

      <div className="mb-4">
        <p className="label-overline mb-2 flex items-center gap-1.5 text-[var(--text-tertiary)]">
          <Ban className="h-3.5 w-3.5" aria-hidden />
          Banujcie w tej kolejności
        </p>
        <ol className="flex flex-wrap gap-2">
          {veto.ourBans.map((map, i) => (
            <li
              key={map}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-1.5 text-sm"
            >
              <span className="font-mono text-xs text-[var(--mistake)]">{i + 1}.</span>
              {mapDisplayName(map)}
            </li>
          ))}
        </ol>
      </div>

      <ul className="space-y-2">
        {veto.ranking.map((r) => {
          const width = `${(Math.abs(r.advantage) / maxAbs) * 50}%`;
          const good = r.advantage >= 0;
          const step = veto.simulation.find((s) => s.map === r.map);
          return (
            <li key={r.map} className="flex items-center gap-3">
              <MapThumb map={r.map} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-[var(--text-primary)]">
                    {mapDisplayName(r.map)}
                    {step && step.by !== "decider" && (
                      <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">
                        {step.by === "us" ? "ban Wasz" : "ban rywali"}
                      </span>
                    )}
                    {step?.by === "decider" && (
                      <span className="ml-2 text-xs font-normal text-[var(--accent-2)]">zostaje</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-xs",
                      good ? "text-[var(--good)]" : "text-[var(--mistake)]"
                    )}
                  >
                    {pp(r.advantage)}
                  </span>
                </div>
                <div className="relative mt-1 h-1.5 rounded-full bg-[var(--surface-3)]" aria-hidden>
                  <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--border-hover)]" />
                  <div
                    className={cn(
                      "absolute inset-y-0 rounded-full",
                      good ? "left-1/2 bg-[var(--good)]" : "right-1/2 bg-[var(--mistake)]"
                    )}
                    style={{ width }}
                  />
                </div>
                <p className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">
                  Wy {pct(r.mine)} · rywale {pct(r.theirs)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function MapList({ maps, tone }: { maps: TeamMapStrength[]; tone: "good" | "bad" }) {
  return (
    <ul className="space-y-2">
      {maps.map((m) => (
        <li key={m.map} className="flex items-center gap-3">
          <MapThumb map={m.map} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">{mapDisplayName(m.map)}</p>
            <p className="font-mono text-xs text-[var(--text-tertiary)]">
              {m.matches > 0 ? `${pct(m.winRate)} WR · ${m.matches} meczów` : "prawie nie grają"}
            </p>
          </div>
          <span
            className={cn(
              "font-mono text-sm",
              tone === "good" ? "text-[var(--mistake)]" : "text-[var(--good)]"
            )}
          >
            {pct(m.strength)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function OpponentCard({
  team,
  strongest,
  weakest,
}: {
  team: ScoutTeam;
  strongest: TeamMapStrength[];
  weakest: TeamMapStrength[];
}) {
  return (
    <Card>
      <CardHeader
        title="Mapy rywali"
        description={
          <>
            Śr. ELO <span className="font-mono">{team.avgElo ?? "—"}</span> · śr. poziom{" "}
            <span className="font-mono">{team.avgLevel ?? "—"}</span>
          </>
        }
      />
      <p className="label-overline mb-2 flex items-center gap-1.5 text-[var(--mistake)]">
        <Swords className="h-3.5 w-3.5" aria-hidden />
        Najmocniejsze, unikajcie
      </p>
      <MapList maps={strongest} tone="good" />
      <p className="label-overline mb-2 mt-5 flex items-center gap-1.5 text-[var(--good)]">
        <Target className="h-3.5 w-3.5" aria-hidden />
        Najsłabsze, celujcie w nie
      </p>
      <MapList maps={weakest} tone="bad" />
    </Card>
  );
}

function MapCells({ m }: { m: TeamMapStrength | undefined }) {
  if (!m) return <td colSpan={3}>—</td>;
  return (
    <>
      <td className="font-mono">{pct(m.winRate)}</td>
      <td className="font-mono">
        {m.matches}
        {m.recentMatches > 0 && <span className="text-[var(--text-tertiary)]"> ({m.recentMatches})</span>}
      </td>
      <td className="font-mono">{fixed(m.kd)}</td>
    </>
  );
}

function MapTable({ us, them, ranking }: { us: ScoutTeam; them: ScoutTeam; ranking: string[] }) {
  const ours = new Map(us.maps.map((m) => [m.map, m]));
  const theirs = new Map(them.maps.map((m) => [m.map, m]));
  return (
    <section>
      <SectionTitle>Mapy obu drużyn</SectionTitle>
      <Card className="p-0 md:p-0">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mapa</th>
                <th>Wy WR</th>
                <th>Mecze</th>
                <th>K/D</th>
                <th>Rywale WR</th>
                <th>Mecze</th>
                <th>K/D</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((map) => (
                <tr key={map}>
                  <td className="whitespace-nowrap">{mapDisplayName(map)}</td>
                  <MapCells m={ours.get(map)} />
                  <MapCells m={theirs.get(map)} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-2 text-xs text-[var(--text-tertiary)]">
        Mecze to suma meczów 5 graczy na mapie (w nawiasie: z ostatnich 20 meczów każdego).
      </p>
    </section>
  );
}

function FormStrip({ results }: { results: ("W" | "L")[] }) {
  if (results.length === 0) return <span className="text-xs text-[var(--text-tertiary)]">brak meczów</span>;
  return (
    <span className="flex gap-0.5" aria-label={`Ostatnie mecze: ${results.join(" ")}`}>
      {results.map((r, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-sm font-mono text-[10px] font-semibold text-[var(--on-accent)]",
            r === "W" ? "bg-[var(--good)]" : "bg-[var(--mistake)]"
          )}
        >
          {r === "W" ? "W" : "P"}
        </span>
      ))}
    </span>
  );
}

function PlayerRow({ p }: { p: ScoutPlayer }) {
  const top = p.maps.slice(0, 3);
  return (
    <li className="border-b border-[var(--border)] py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <UserAvatar name={p.nickname} image={p.avatar} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`https://www.faceit.com/pl/players/${encodeURIComponent(p.nickname)}`}
              target="_blank"
              rel="noreferrer"
              className="truncate font-semibold text-[var(--text-primary)] hover:text-[var(--accent-hover)]"
            >
              {p.nickname}
            </a>
            {p.level !== null && (
              <Badge variant={p.level >= 10 ? "lime" : "default"} className="font-mono">
                LVL {p.level}
              </Badge>
            )}
            {p.elo !== null && <span className="font-mono text-xs text-[var(--text-tertiary)]">{p.elo} ELO</span>}
          </div>
          <div className="mt-1">
            <FormStrip results={p.recent.results} />
          </div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Stat label="K/D ogółem" value={fixed(p.lifetime.kd)} />
        <Stat label="Winrate" value={p.lifetime.winRate === null ? "—" : `${Math.round(p.lifetime.winRate)}%`} />
        <Stat label="K/D ost. 20" value={fixed(p.recent.kd)} />
        <Stat label="ADR ost. 20" value={fixed(p.recent.adr, 0)} />
      </dl>
      {top.length > 0 && (
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          Najczęściej:{" "}
          {top.map((m, i) => (
            <span key={m.map}>
              {i > 0 && ", "}
              <span className="text-[var(--text-secondary)]">{mapDisplayName(m.map)}</span>{" "}
              <span className="font-mono">
                {m.matches} · {Math.round((m.wins / m.matches) * 100)}%
              </span>
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd className="font-mono text-sm text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function TeamCard({ team, title, accent }: { team: ScoutTeam; title: string; accent: "ours" | "theirs" }) {
  return (
    <Card className={accent === "ours" ? "border-[var(--accent-muted)]" : undefined}>
      <CardHeader
        title={<span className="break-words">{title}</span>}
        description={
          <>
            Śr. ELO <span className="font-mono">{team.avgElo ?? "—"}</span> · śr. poziom{" "}
            <span className="font-mono">{team.avgLevel ?? "—"}</span>
          </>
        }
      />
      <ul>
        {team.players.map((p) => (
          <PlayerRow key={p.playerId} p={p} />
        ))}
      </ul>
    </Card>
  );
}
