"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ExternalLink, Loader2, Play } from "lucide-react";
import type { DemoFetchStatus } from "@prisma/client";
import { Badge, Button, Card, Checkbox, SectionTitle } from "@/components/ui";
import { MapThumb, ResultBadge } from "@/components/match";
import { formatDate } from "@/lib/utils/formatters";
import { FaceitDownloadButton } from "@/components/faceit-download-button";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { useT } from "@/lib/i18n/client";
import {
  DEFAULT_FILTERS,
  filterHistory,
  historyMaps,
  type HistoryFilters,
  type PeriodFilter,
  type ResultFilter,
} from "@/lib/faceit/filters";

export interface PickerMatch {
  id: string;
  map: string;
  score: string;
  date: string; // ISO
  competition: string | null;
  result: "WIN" | "LOSS" | null;
  faceitUrl: string;
  demoStatus: DemoFetchStatus;
  /** Upload in flight for this match (download running). */
  uploadId: string | null;
}

interface Props {
  matches: PickerMatch[];
  downloadsEnabled: boolean;
  remaining: number; // analyses left this month (Infinity = unlimited)
  monthlyLimit: number;
  batchSize: number;
  /** Match picked from outside (the browser extension's "Analyze" on FACEIT, S26): pre-selected and scrolled to. */
  initialSelected?: string | null;
}

const selectClass =
  "h-10 min-w-0 flex-1 basis-28 rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)] focus:outline-none max-md:min-h-11 sm:flex-none sm:basis-auto";

const matchWord = (n: number) =>
  n === 1 ? "mecz" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "mecze" : "meczów";

/**
 * FACEIT match history with checkboxes and filters. "Analyze selected" queues
 * a download + analysis per match (Downloads API), or, when that isn't
 * available, opens the upload page listing the picked matches.
 */
export function FaceitHistoryPicker({
  matches,
  downloadsEnabled,
  remaining,
  monthlyLimit,
  batchSize,
  initialSelected = null,
}: Props) {
  const router = useRouter();
  const t = useT();
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const preselect = initialSelected
    ? (matches.find((m) => m.id === initialSelected && !m.uploadId) ?? null)
    : null;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(preselect && Math.min(remaining, batchSize) > 0 ? [preselect.id] : [])
  );
  const [keepDemo, setKeepDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const maps = useMemo(() => historyMaps(matches), [matches]);
  const visible = useMemo(() => filterHistory(matches, filters), [matches, filters]);
  // In-flight matches can't be picked again.
  const pickable = visible.filter((m) => !m.uploadId);
  const cap = Math.min(remaining, batchSize);
  const atCap = selected.size >= cap;

  const toggle = (id: string) => {
    setError("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < cap) next.add(id);
      return next;
    });
  };

  const selectVisible = () => {
    setSelected(new Set(pickable.slice(0, cap).map((m) => m.id)));
  };

  const analyze = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/faceit/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], keepDemo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Nie udało się rozpocząć analizy");
        return;
      }
      if (data.mode === "upload") {
        router.push(keepDemo ? `${data.uploadUrl}&keep=1` : data.uploadUrl);
      } else {
        router.push("/queue");
      }
    } catch {
      setError("Nie udało się rozpocząć analizy — sprawdź połączenie");
    } finally {
      setBusy(false);
    }
  };

  // Bring the picked match into view (it can be far down a long history).
  useEffect(() => {
    if (!initialSelected) return;
    document.getElementById(`faceit-match-${initialSelected}`)?.scrollIntoView({ block: "center" });
  }, [initialSelected]);

  const limitText = Number.isFinite(monthlyLimit)
    ? `Zostało ${remaining} z ${monthlyLimit} analiz w tym miesiącu · do ${batchSize} naraz`
    : `Do ${batchSize} meczów naraz`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <SectionTitle className="mb-1">Historia FACEIT</SectionTitle>
          <p className="text-xs text-[var(--text-tertiary)]">
            Wybierz mecze do analizy. <span className="font-mono tabular-nums">{limitText}</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Mapa"
            className={selectClass}
            value={filters.map}
            onChange={(e) => setFilters({ ...filters, map: e.target.value })}
          >
            <option value="all">Wszystkie mapy</option>
            {maps.map((m) => (
              <option key={m} value={m}>
                {mapDisplayName(m)}
              </option>
            ))}
          </select>
          <select
            aria-label="Wynik"
            className={selectClass}
            value={filters.result}
            onChange={(e) => setFilters({ ...filters, result: e.target.value as ResultFilter })}
          >
            <option value="all">Każdy wynik</option>
            <option value="WIN">Wygrane</option>
            <option value="LOSS">Przegrane</option>
          </select>
          <select
            aria-label="Okres"
            className={selectClass}
            value={filters.period}
            onChange={(e) => setFilters({ ...filters, period: e.target.value as PeriodFilter })}
          >
            <option value="all">Cały okres</option>
            <option value="7">Ostatnie 7 dni</option>
            <option value="30">Ostatnie 30 dni</option>
            <option value="90">Ostatnie 90 dni</option>
          </select>
        </div>
      </div>

      {preselect && selected.has(preselect.id) && (
        <p
          role="status"
          className="rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          {t("faceitRoom.selected")}
        </p>
      )}

      {!downloadsEnabled && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          Automatyczne pobieranie dem z FACEIT nie jest jeszcze dostępne. Po wybraniu meczów
          pokażemy pokój każdego meczu, żebyś mógł pobrać demo i je wrzucić.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-tertiary)]">
        <span>
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">{visible.length}</span>{" "}
          {matchWord(visible.length)}
        </span>
        <button
          type="button"
          onClick={selectVisible}
          disabled={pickable.length === 0 || cap === 0}
          className="font-semibold text-[var(--accent-hover)] hover:underline disabled:opacity-40 disabled:no-underline max-md:min-h-11"
        >
          Zaznacz widoczne
          {Math.min(pickable.length, cap) ? (
            <span className="font-mono tabular-nums"> ({Math.min(pickable.length, cap)})</span>
          ) : null}
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="hover:text-[var(--text-secondary)] max-md:min-h-11"
          >
            Wyczyść
          </button>
        )}
        {cap === 0 && <Badge variant="warning">Osiągnięto miesięczny limit</Badge>}
      </div>

      {visible.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">
            Żaden mecz FACEIT nie pasuje do tych filtrów.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((fm) => {
            const [s1, s2] = fm.score.split("-");
            const checked = selected.has(fm.id);
            const disabled = Boolean(fm.uploadId) || (!checked && atCap);
            return (
              <Card
                key={fm.id}
                id={`faceit-match-${fm.id}`}
                className={`scroll-mt-24 flex flex-col gap-2 border-l-[3px] p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4 ${checked ? "border-[var(--border-active)] bg-[var(--surface-2)]" : ""}`}
                style={{
                  borderLeftColor:
                    fm.result === "WIN"
                      ? "var(--good)"
                      : fm.result === "LOSS"
                        ? "var(--mistake)"
                        : "var(--faceit)",
                }}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(fm.id)}
                  aria-label={`Zaznacz ${mapDisplayName(fm.map)} ${formatDate(fm.date)}`}
                  className={`flex min-w-0 flex-1 gap-3 ${fm.uploadId ? "opacity-70" : ""}`}
                  label={
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <MapThumb map={fm.map} size="sm" />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-display font-semibold text-[var(--text-primary)]">
                            {mapDisplayName(fm.map)}
                          </span>
                          {fm.result && <ResultBadge result={fm.result === "WIN" ? "W" : "L"} />}
                          <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
                            {s1}:{s2}
                          </span>
                          {fm.uploadId && <Badge variant="default">W kolejce</Badge>}
                        </span>
                        <span className="block truncate text-xs text-[var(--text-tertiary)]">
                          {formatDate(fm.date)}
                          {fm.competition ? ` — ${fm.competition}` : ""}
                        </span>
                      </span>
                    </span>
                  }
                />

                <div className="flex flex-wrap items-center gap-2 pl-[30px] sm:pl-0">
                  <a
                    href={fm.faceitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--faceit-muted)] px-3 text-xs font-semibold text-[var(--faceit)] transition-colors hover:bg-[rgba(255,85,0,0.25)] max-md:min-h-11"
                  >
                    FACEIT <ExternalLink className="h-3 w-3" aria-hidden />
                    <span className="sr-only">(otwiera się w nowej karcie)</span>
                  </a>
                  <FaceitDownloadButton
                    faceitMatchId={fm.id}
                    demoStatus={fm.demoStatus}
                    initialUploadId={fm.uploadId}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Sticky action bar (sits above the mobile bottom nav) */}
      {selected.size > 0 && (
        <div className="sticky bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+8px)] z-10 rounded-xl border border-[var(--border-active)] bg-[var(--glass-bg)] p-3 shadow-[var(--shadow-lg)] backdrop-blur-md md:bottom-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Checkbox
              checked={keepDemo}
              onChange={(e) => setKeepDemo(e.target.checked)}
              className="text-xs"
              label="Zachowaj pliki demo (domyślnie usuwane po analizie)"
            />
            <Button onClick={analyze} disabled={busy} className="w-full sm:w-auto">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              Analizuj zaznaczone (<span className="font-mono tabular-nums">{selected.size}</span>)
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-[var(--mistake)]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
