"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle, Clock, Download, Loader2, RotateCcw, X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import type { QueueItem, QueueStage } from "@/lib/library";
import { mapDisplayName } from "@/lib/utils/mapNames";

const STAGE_LABEL: Record<QueueStage, string> = {
  queued: "Waiting",
  downloading: "Downloading from FACEIT",
  parsing: "Analyzing",
  done: "Done",
  failed: "Failed",
};

const ACTIVE: QueueStage[] = ["queued", "downloading", "parsing"];

function StageIcon({ stage }: { stage: QueueStage }) {
  const cls = "h-5 w-5 flex-shrink-0";
  if (stage === "done") return <CheckCircle className={`${cls} text-[var(--success)]`} />;
  if (stage === "failed") return <AlertCircle className={`${cls} text-[var(--error)]`} />;
  if (stage === "downloading") return <Download className={`${cls} animate-pulse text-[var(--accent)]`} />;
  if (stage === "parsing") return <Loader2 className={`${cls} animate-spin text-[var(--accent)]`} />;
  return <Clock className={`${cls} text-[var(--text-tertiary)]`} />;
}

export function QueueList({ initialItems }: { initialItems: QueueItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/uploads", { cache: "no-store" });
      if (res.ok) setItems((await res.json()).items);
    } catch {
      // keep the last list; next poll retries
    }
  }, []);

  const hasActive = items.some((i) => ACTIVE.includes(i.stage));
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [hasActive, refresh]);

  const act = async (id: string, method: "POST" | "DELETE", path: string) => {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(path, { method });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong");
      }
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center py-12 text-center">
          <p className="text-lg font-medium text-[var(--text-secondary)]">The queue is empty</p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">
            Pick matches from your FACEIT history or upload demos to analyze them.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/matches">
              <Button variant="secondary">FACEIT history</Button>
            </Link>
            <Link href="/upload">
              <Button>Upload demos</Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const counts = {
    active: items.filter((i) => ACTIVE.includes(i.stage)).length,
    done: items.filter((i) => i.stage === "done").length,
    failed: items.filter((i) => i.stage === "failed").length,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-tertiary)]">
        <span>
          In progress <span className="font-mono text-[var(--text-primary)]">{counts.active}</span>
        </span>
        <span>
          Done <span className="font-mono text-[var(--success)]">{counts.done}</span>
        </span>
        <span>
          Failed <span className="font-mono text-[var(--error)]">{counts.failed}</span>
        </span>
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--error)]">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
      {items.map((it) => {
        const active = ACTIVE.includes(it.stage);
        return (
          <Card key={it.id} className="p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <StageIcon stage={it.stage} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-medium text-[var(--text-primary)]">
                    {it.map ? mapDisplayName(it.map) : "Demo"}
                  </p>
                  {it.source === "FACEIT" && (
                    <span className="rounded-full bg-[rgba(255,85,0,0.15)] px-1.5 py-0.5 text-[10px] font-bold text-[#ff5500]">
                      FACEIT
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-[var(--text-tertiary)]">{it.label}</p>
                <p
                  className={`mt-1 text-xs ${it.stage === "failed" ? "text-[var(--error)]" : "text-[var(--text-secondary)]"}`}
                >
                  {STAGE_LABEL[it.stage]}
                  {it.stage === "parsing" && <span className="font-mono"> {it.progress}%</span>}
                  {it.error && it.stage !== "done" ? ` · ${it.error}` : ""}
                </p>
                {it.stage === "parsing" && (
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                      style={{ width: `${it.progress}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                {it.stage === "done" && it.matchId && (
                  <Link href={`/matches/${it.matchId}`}>
                    <Button size="sm">Report</Button>
                  </Link>
                )}
                {it.stage === "failed" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === it.id}
                    onClick={() => act(it.id, "POST", `/api/uploads/${it.id}/retry`)}
                    aria-label="Retry"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Retry</span>
                  </Button>
                )}
                {(it.stage === "failed" || it.stage === "queued") && (
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busyId === it.id}
                    onClick={() => act(it.id, "DELETE", `/api/uploads/${it.id}`)}
                    aria-label={it.stage === "queued" ? "Cancel" : "Remove"}
                    title={it.stage === "queued" ? "Cancel" : "Remove"}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                {active && it.stage !== "queued" && <span className="sr-only">In progress</span>}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
