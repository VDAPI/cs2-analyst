"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Archive, FileX, Play, Trash2 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import type { DemoState } from "@/lib/library";
import { mapDisplayName } from "@/lib/utils/mapNames";

export interface LibraryEntry {
  uploadId: string;
  matchId: string;
  map: string;
  date: string; // ISO, match date
  analyzedAt: string; // ISO
  scoreCT: number;
  scoreT: number;
  result: "W" | "L" | "D" | null;
  rating: number | null;
  source: "MANUAL" | "FACEIT";
  fileName: string;
  fileSize: number;
  demo: DemoState;
  replayStored: boolean;
}

const DEMO_LABEL: Record<DemoState, string> = {
  deleted: "Demo deleted",
  kept: "Demo kept",
  stored: "Demo on file",
  pending_delete: "Demo pending deletion",
};

const RESULT_STYLE = {
  W: "bg-[rgba(34,197,94,0.15)] text-[#22c55e]",
  L: "bg-[rgba(239,68,68,0.15)] text-[#ef4444]",
  D: "bg-[rgba(113,113,122,0.15)] text-[#71717a]",
} as const;

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

export function LibraryList({ entries }: { entries: LibraryEntry[] }) {
  const router = useRouter();
  const [map, setMap] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const maps = useMemo(() => [...new Set(entries.map((e) => e.map))].sort(), [entries]);
  const shown = map === "all" ? entries : entries.filter((e) => e.map === map);

  const call = async (uploadId: string, init: RequestInit) => {
    setBusy(uploadId);
    setError("");
    try {
      const res = await fetch(`/api/uploads/${uploadId}`, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong");
      }
      router.refresh();
    } catch {
      setError("Something went wrong — check your connection");
    } finally {
      setBusy(null);
    }
  };

  const patch = (uploadId: string, body: object) =>
    call(uploadId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const remove = (e: LibraryEntry) => {
    const ok = window.confirm(
      `Delete the ${mapDisplayName(e.map)} analysis? The report, the 2D replay and the demo file are removed for good.`
    );
    if (ok) void call(e.uploadId, { method: "DELETE" });
  };

  if (entries.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center py-12 text-center">
          <p className="text-lg font-medium text-[var(--text-secondary)]">No saved analyses yet</p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">
            Finished analyses land here, with their report and 2D replay.
          </p>
          <Link href="/upload" className="mt-4">
            <Button>Upload demos</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          aria-label="Map"
          value={map}
          onChange={(e) => setMap(e.target.value)}
          className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-active)] focus:outline-none"
        >
          <option value="all">All maps</option>
          {maps.map((m) => (
            <option key={m} value={m}>
              {mapDisplayName(m)}
            </option>
          ))}
        </select>
        <span className="font-mono text-xs text-[var(--text-tertiary)]">{shown.length} analyses</span>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--error)]">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
        </p>
      )}

      {shown.map((e) => {
        const hasFile = e.demo === "kept" || e.demo === "stored" || e.demo === "pending_delete";
        return (
          <Card key={e.uploadId} className="p-3 sm:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <Link href={`/matches/${e.matchId}`} className="flex min-w-0 items-center gap-3">
                <div
                  className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--surface-3)] bg-cover bg-center"
                  style={{
                    backgroundImage: `url(/maps/${e.map}_radar.png)`,
                    filter: "grayscale(40%) brightness(0.7)",
                  }}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-medium text-[var(--text-primary)]">{mapDisplayName(e.map)}</p>
                    {e.result && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${RESULT_STYLE[e.result]}`}>
                        {e.result}
                      </span>
                    )}
                    <span className="font-mono text-sm text-[var(--text-secondary)]">
                      {e.scoreCT}:{e.scoreT}
                    </span>
                    {e.rating !== null && (
                      <span className="font-mono text-xs text-[var(--t-gold)]">{e.rating.toFixed(2)}</span>
                    )}
                    {e.source === "FACEIT" && (
                      <span className="rounded-full bg-[rgba(255,85,0,0.15)] px-1.5 py-0.5 text-[10px] font-bold text-[#ff5500]">
                        FACEIT
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-[var(--text-tertiary)]">
                    {new Date(e.date).toLocaleDateString()} · {DEMO_LABEL[e.demo]}
                    {hasFile && e.fileSize > 0 ? ` (${formatSize(e.fileSize)})` : ""}
                    {!e.replayStored ? " · no stored replay data" : ""}
                  </p>
                </div>
              </Link>

              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/replay/${e.matchId}`}>
                  <Button size="sm" variant="secondary">
                    <Play className="h-3.5 w-3.5" /> Replay
                  </Button>
                </Link>
                {e.demo !== "deleted" && (
                  <label
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs text-[var(--text-secondary)]"
                    title="Keep the .dem file instead of deleting it"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent)]"
                      checked={e.demo === "kept"}
                      disabled={busy === e.uploadId}
                      onChange={(ev) => patch(e.uploadId, { keepDemo: ev.target.checked })}
                    />
                    <Archive className="h-3.5 w-3.5" /> Keep demo
                  </label>
                )}
                {hasFile && e.replayStored && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === e.uploadId}
                    onClick={() => patch(e.uploadId, { deleteDemo: true })}
                    title="Delete the .dem file, keep the analysis"
                  >
                    <FileX className="h-3.5 w-3.5" /> Delete demo
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy === e.uploadId}
                  onClick={() => remove(e)}
                  aria-label="Delete analysis"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Delete analysis</span>
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
