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

  return (
    <div className="flex items-center gap-3">
      {syncing ? (
        <div className="flex items-center gap-2 rounded-lg bg-[rgba(255,85,0,0.08)] px-3 py-2 text-xs text-[#ff5500]">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Syncing FACEIT matches…
        </div>
      ) : result ? (
        <div className="flex items-center gap-2 rounded-lg bg-[rgba(34,197,94,0.08)] px-3 py-2 text-xs text-[var(--success)]">
          {result.synced > 0
            ? `Synced ${result.synced} new match${result.synced !== 1 ? "es" : ""}`
            : "No new matches found"}
          {result.errors.length > 0 && ` (${result.errors.length} error${result.errors.length !== 1 ? "s" : ""})`}
        </div>
      ) : null}

      <Button
        variant="secondary"
        size="sm"
        onClick={runSync}
        disabled={syncing}
        className="!border-[#ff5500] !text-[#ff5500] hover:!bg-[rgba(255,85,0,0.1)]"
      >
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        Sync FACEIT
      </Button>
    </div>
  );
}
