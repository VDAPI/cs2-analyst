"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ExternalLink, Loader2, Play } from "lucide-react";
import type { DemoFetchStatus } from "@prisma/client";
import { Button, Card } from "@/components/ui";
import { FaceitDownloadButton } from "@/components/faceit-download-button";
import { mapDisplayName } from "@/lib/utils/mapNames";
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
}

const selectClass =
  "h-9 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-active)] focus:outline-none sm:flex-none";

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
}: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
        setError(data.error ?? "Could not start the analysis");
        return;
      }
      if (data.mode === "upload") {
        router.push(keepDemo ? `${data.uploadUrl}&keep=1` : data.uploadUrl);
      } else {
        router.push("/queue");
      }
    } catch {
      setError("Could not start the analysis — check your connection");
    } finally {
      setBusy(false);
    }
  };

  const limitText = Number.isFinite(monthlyLimit)
    ? `${remaining} of ${monthlyLimit} analyses left this month · up to ${batchSize} at once`
    : `Up to ${batchSize} matches at once`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">FACEIT history</h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            Pick the matches to analyze. {limitText}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Map"
            className={selectClass}
            value={filters.map}
            onChange={(e) => setFilters({ ...filters, map: e.target.value })}
          >
            <option value="all">All maps</option>
            {maps.map((m) => (
              <option key={m} value={m}>
                {mapDisplayName(m)}
              </option>
            ))}
          </select>
          <select
            aria-label="Result"
            className={selectClass}
            value={filters.result}
            onChange={(e) => setFilters({ ...filters, result: e.target.value as ResultFilter })}
          >
            <option value="all">Any result</option>
            <option value="WIN">Wins</option>
            <option value="LOSS">Losses</option>
          </select>
          <select
            aria-label="Period"
            className={selectClass}
            value={filters.period}
            onChange={(e) => setFilters({ ...filters, period: e.target.value as PeriodFilter })}
          >
            <option value="all">Any time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>

      {!downloadsEnabled && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          Automatic FACEIT downloads aren&apos;t available yet. After you pick matches we&apos;ll
          show each match room so you can download its demo and drop it in.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--text-tertiary)]">
        <span className="font-mono">
          {visible.length} match{visible.length === 1 ? "" : "es"}
        </span>
        <button
          type="button"
          onClick={selectVisible}
          disabled={pickable.length === 0 || cap === 0}
          className="text-[var(--accent-hover)] hover:underline disabled:opacity-40 disabled:no-underline"
        >
          Select {Math.min(pickable.length, cap) || ""} shown
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="hover:text-[var(--text-secondary)]"
          >
            Clear
          </button>
        )}
        {cap === 0 && <span className="text-[var(--warning)]">Monthly limit reached</span>}
      </div>

      {visible.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">
            No FACEIT matches match these filters.
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
                className={`flex flex-col gap-3 border-l-[3px] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 ${checked ? "border-[var(--border-active)]" : ""}`}
                style={{
                  borderLeftColor:
                    fm.result === "WIN" ? "#22c55e" : fm.result === "LOSS" ? "#ef4444" : "#ff5500",
                }}
              >
                <label
                  className={`flex min-w-0 flex-1 items-center gap-3 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5 flex-shrink-0 accent-[var(--accent)]"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(fm.id)}
                    aria-label={`Select ${mapDisplayName(fm.map)} ${fm.date.slice(0, 10)}`}
                  />
                  <div
                    className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--surface-3)] bg-cover bg-center"
                    style={{
                      backgroundImage: `url(/maps/${fm.map}_radar.png)`,
                      filter: "grayscale(40%) brightness(0.7)",
                    }}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-medium text-[var(--text-primary)]">{mapDisplayName(fm.map)}</p>
                      {fm.result && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            fm.result === "WIN"
                              ? "bg-[rgba(34,197,94,0.15)] text-[#22c55e]"
                              : "bg-[rgba(239,68,68,0.15)] text-[#ef4444]"
                          }`}
                        >
                          {fm.result === "WIN" ? "W" : "L"}
                        </span>
                      )}
                      <span className="font-mono text-sm text-[var(--text-secondary)]">
                        {s1}:{s2}
                      </span>
                      {fm.uploadId && (
                        <span className="rounded-full bg-[var(--accent-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-hover)]">
                          In queue
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-[var(--text-tertiary)]">
                      {new Date(fm.date).toLocaleDateString()}
                      {fm.competition ? ` — ${fm.competition}` : ""}
                    </p>
                  </div>
                </label>

                <div className="flex flex-wrap items-center gap-2 pl-8 sm:pl-0">
                  <a
                    href={fm.faceitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--surface-3)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  >
                    FACEIT <ExternalLink className="h-3 w-3" />
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

      {/* Sticky action bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 z-10 -mx-1 rounded-xl border border-[var(--border-active)] bg-[var(--glass-bg)] p-3 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={keepDemo}
                onChange={(e) => setKeepDemo(e.target.checked)}
              />
              Keep the demo files (otherwise deleted after analysis)
            </label>
            <Button onClick={analyze} disabled={busy} className="w-full sm:w-auto">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Analyze selected ({selected.size})
            </Button>
          </div>
          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--error)]">
              <AlertCircle className="h-3.5 w-3.5" /> {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
