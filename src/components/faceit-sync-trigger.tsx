"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

interface FaceitSyncTriggerProps {
  hasFaceit: boolean;
}

export function FaceitSyncTrigger({ hasFaceit }: FaceitSyncTriggerProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{
    synced: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const runSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/faceit/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      if (!res.ok) return;

      const data = await res.json();
      setResult(data);

      if (data.synced > 0) {
        router.refresh();
      }
    } catch {
      // Silently fail — sync is best-effort
    } finally {
      setSyncing(false);
    }
  }, [syncing, router]);

  if (!hasFaceit) return null;

  const matchWord = (n: number) =>
    n === 1 ? "nowy mecz" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "nowe mecze" : "nowych meczów";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {syncing ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg bg-[var(--faceit-muted)] px-3 py-2 text-xs text-[var(--faceit)]"
        >
          <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
          Synchronizacja meczów FACEIT…
        </div>
      ) : result ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg bg-[var(--good-muted)] px-3 py-2 text-xs text-[var(--good)]"
        >
          {result.synced > 0 ? (
            <span>
              Zsynchronizowano{" "}
              <span className="font-mono tabular-nums">{result.synced}</span>{" "}
              {matchWord(result.synced)}
            </span>
          ) : (
            "Brak nowych meczów"
          )}
          {result.errors.length > 0 && (
            <span className="text-[var(--warning)]">
              (błędy: <span className="font-mono tabular-nums">{result.errors.length}</span>)
            </span>
          )}
        </div>
      ) : null}

      <Button
        variant="secondary"
        size="sm"
        onClick={runSync}
        disabled={syncing}
        className="border-[var(--faceit)] text-[var(--faceit)] hover:border-[var(--faceit)] hover:bg-[var(--faceit-muted)] hover:text-[var(--faceit)]"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden />
        Synchronizuj FACEIT
      </Button>
    </div>
  );
}
