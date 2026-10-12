"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Archive, FileText, FileX, Library, Play, Trash2, Upload } from "lucide-react";
import { Badge, Button, Card, EmptyState, buttonVariants, type BadgeProps } from "@/components/ui";
import { MapThumb, ResultBadge, SourceBadge } from "@/components/match";
import { formatDate } from "@/lib/utils/formatters";
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
  source: "MANUAL" | "FACEIT" | "STEAM";
  fileName: string;
  fileSize: number;
  demo: DemoState;
  replayStored: boolean;
}

const DEMO_LABEL: Record<DemoState, string> = {
  deleted: "Demo usunięte",
  kept: "Demo zachowane",
  stored: "Demo na dysku",
  pending_delete: "Demo czeka na usunięcie",
};

const DEMO_BADGE: Record<DemoState, NonNullable<BadgeProps["variant"]>> = {
  deleted: "neutral",
  kept: "default",
  stored: "neutral",
  pending_delete: "warning",
};

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

const selectClass =
  "h-10 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)] focus:outline-none max-md:min-h-11";

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
        setError(data.error ?? "Coś poszło nie tak");
      }
      router.refresh();
    } catch {
      setError("Coś poszło nie tak — sprawdź połączenie");
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
      `Usunąć analizę ${mapDisplayName(e.map)}? Raport, powtórka 2D i plik demo zostaną usunięte na zawsze.`
    );
    if (ok) void call(e.uploadId, { method: "DELETE" });
  };

  const removeDemo = (e: LibraryEntry) => {
    const ok = window.confirm(
      `Usunąć plik demo meczu ${mapDisplayName(e.map)}? Analiza i powtórka 2D zostaną.`
    );
    if (ok) void patch(e.uploadId, { deleteDemo: true });
  };

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Library}
        title="Brak zapisanych analiz"
        description="Gotowe analizy trafiają tutaj, razem z raportem i powtórką 2D."
        action={
          <Link href="/upload" className={buttonVariants({ variant: "cta" })}>
            <Upload className="h-4 w-4" aria-hidden />
            Wgraj demo
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          aria-label="Mapa"
          value={map}
          onChange={(e) => setMap(e.target.value)}
          className={selectClass}
        >
          <option value="all">Wszystkie mapy</option>
          {maps.map((m) => (
            <option key={m} value={m}>
              {mapDisplayName(m)}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-tertiary)]">
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">{shown.length}</span>{" "}
          {plural(shown.length, "analiza", "analizy", "analiz")}
        </span>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-[var(--mistake)]">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden /> {error}
        </p>
      )}

      {shown.map((e) => {
        const hasFile = e.demo === "kept" || e.demo === "stored" || e.demo === "pending_delete";
        const isBusy = busy === e.uploadId;
        return (
          <Card key={e.uploadId} className="p-3 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Link
                href={`/matches/${e.matchId}`}
                className="group flex min-w-0 items-center gap-3"
              >
                <MapThumb map={e.map} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-display font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-hover)]">
                      {mapDisplayName(e.map)}
                    </p>
                    {e.result && <ResultBadge result={e.result} />}
                    <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
                      {e.scoreCT}:{e.scoreT}
                    </span>
                    {e.rating !== null && (
                      <span
                        className="font-mono text-xs tabular-nums text-[var(--text-secondary)]"
                        title="Rating"
                      >
                        <span className="text-[var(--text-tertiary)]">Rating </span>
                        {e.rating.toFixed(2)}
                      </span>
                    )}
                    <SourceBadge source={e.source} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-tertiary)]">
                    <span>{formatDate(e.date)}</span>
                    <Badge variant={DEMO_BADGE[e.demo]}>
                      {DEMO_LABEL[e.demo]}
                      {hasFile && e.fileSize > 0 && (
                        <span className="font-mono tabular-nums">({formatSize(e.fileSize)})</span>
                      )}
                    </Badge>
                    {!e.replayStored && <Badge variant="warning">Brak zapisanej powtórki</Badge>}
                  </div>
                </div>
              </Link>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/matches/${e.matchId}`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden /> Raport
                </Link>
                <Link
                  href={`/replay/${e.matchId}`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  <Play className="h-3.5 w-3.5" aria-hidden /> Replay 2D
                </Link>
                {e.demo !== "deleted" && (
                  <label
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--border-hover)] max-md:min-h-11"
                    title="Zachowaj plik .dem zamiast go usuwać"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent)]"
                      checked={e.demo === "kept"}
                      disabled={isBusy}
                      onChange={(ev) => patch(e.uploadId, { keepDemo: ev.target.checked })}
                    />
                    <Archive className="h-3.5 w-3.5" aria-hidden /> Zachowaj demo
                  </label>
                )}
                {hasFile && e.replayStored && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => removeDemo(e)}
                    title="Usuń plik .dem, zostaw analizę"
                  >
                    <FileX className="h-3.5 w-3.5" aria-hidden /> Usuń demo
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  disabled={isBusy}
                  onClick={() => remove(e)}
                  aria-label="Usuń analizę"
                  title="Usuń analizę"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden sm:inline">Usuń analizę</span>
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
