"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  FileText,
  ListOrdered,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Progress,
  buttonVariants,
  type BadgeProps,
} from "@/components/ui";
import { MapThumb, SourceBadge } from "@/components/match";
import { formatDateTime } from "@/lib/utils/formatters";
import type { QueueItem, QueueStage } from "@/lib/library";
import { mapDisplayName } from "@/lib/utils/mapNames";

const STAGE_LABEL: Record<QueueStage, string> = {
  queued: "W kolejce",
  downloading: "Pobieranie z FACEIT",
  parsing: "Analizowanie",
  done: "Gotowe",
  failed: "Błąd",
};

const STAGE_BADGE: Record<QueueStage, NonNullable<BadgeProps["variant"]>> = {
  queued: "neutral",
  downloading: "default",
  parsing: "default",
  done: "success",
  failed: "error",
};

const STAGE_BORDER: Record<QueueStage, string> = {
  queued: "var(--border-hover)",
  downloading: "var(--accent)",
  parsing: "var(--accent)",
  done: "var(--good)",
  failed: "var(--mistake)",
};

const ACTIVE: QueueStage[] = ["queued", "downloading", "parsing"];

function StageIcon({ stage }: { stage: QueueStage }) {
  const cls = "h-3.5 w-3.5 flex-shrink-0";
  if (stage === "done") return <CheckCircle className={cls} aria-hidden />;
  if (stage === "failed") return <AlertCircle className={cls} aria-hidden />;
  if (stage === "downloading") return <Download className={`${cls} animate-pulse`} aria-hidden />;
  if (stage === "parsing") return <Loader2 className={`${cls} animate-spin`} aria-hidden />;
  return <Clock className={cls} aria-hidden />;
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
        setError(data.error ?? "Coś poszło nie tak");
      }
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ListOrdered}
        title="Kolejka jest pusta"
        description="Wybierz mecze z historii FACEIT albo wgraj dema, żeby je przeanalizować."
        action={
          <>
            <Link href="/matches" className={buttonVariants({ variant: "secondary" })}>
              Historia FACEIT
            </Link>
            <Link href="/upload" className={buttonVariants({ variant: "primary" })}>
              <Upload className="h-4 w-4" aria-hidden />
              Wgraj demo
            </Link>
          </>
        }
      />
    );
  }

  const counts = {
    active: items.filter((i) => ACTIVE.includes(i.stage)).length,
    done: items.filter((i) => i.stage === "done").length,
    failed: items.filter((i) => i.stage === "failed").length,
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        {[
          { label: "W toku", value: counts.active, color: "var(--accent)" },
          { label: "Gotowe", value: counts.done, color: "var(--good)" },
          { label: "Błędy", value: counts.failed, color: "var(--mistake)" },
        ].map((c) => (
          <div
            key={c.label}
            className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2"
          >
            <p className="label-overline truncate text-[var(--text-tertiary)]">{c.label}</p>
            <p className="font-mono text-lg font-semibold tabular-nums" style={{ color: c.color }}>
              {c.value}
            </p>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-[var(--mistake)]">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden /> {error}
        </p>
      )}
      {items.map((it) => {
        const active = ACTIVE.includes(it.stage);
        return (
          <Card
            key={it.id}
            className="border-l-[3px] p-3 sm:p-4"
            style={{ borderLeftColor: STAGE_BORDER[it.stage] }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {it.map ? (
                  <MapThumb map={it.map} size="sm" />
                ) : (
                  <div
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-tertiary)]"
                  >
                    <FileText className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-display font-semibold text-[var(--text-primary)]">
                      {it.map ? mapDisplayName(it.map) : "Demo"}
                    </p>
                    <SourceBadge source={it.source} />
                    <Badge variant={STAGE_BADGE[it.stage]}>
                      <StageIcon stage={it.stage} />
                      {STAGE_LABEL[it.stage]}
                      {it.stage === "parsing" && (
                        <span className="font-mono tabular-nums">{it.progress}%</span>
                      )}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
                    {it.label}
                    <span aria-hidden> · </span>
                    <span className="font-mono tabular-nums">{formatDateTime(it.createdAt)}</span>
                  </p>
                  {it.error && it.stage !== "done" && (
                    <p
                      className={`mt-1 break-words text-xs ${it.stage === "failed" ? "text-[var(--mistake)]" : "text-[var(--text-secondary)]"}`}
                    >
                      {it.error}
                    </p>
                  )}
                  {it.stage === "parsing" && (
                    <Progress value={it.progress} label="Postęp analizy" className="mt-2" />
                  )}
                  {(it.stage === "queued" || it.stage === "downloading") && (
                    <Progress label={STAGE_LABEL[it.stage]} className="mt-2" />
                  )}
                </div>
              </div>
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2 pl-12 sm:pl-0">
                {it.stage === "done" && it.matchId && (
                  <Link
                    href={`/matches/${it.matchId}`}
                    className={buttonVariants({ variant: "primary", size: "sm" })}
                  >
                    Raport
                  </Link>
                )}
                {it.stage === "failed" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === it.id}
                    onClick={() => act(it.id, "POST", `/api/uploads/${it.id}/retry`)}
                    aria-label="Ponów"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    <span>Ponów</span>
                  </Button>
                )}
                {(it.stage === "failed" || it.stage === "queued") && (
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busyId === it.id}
                    onClick={() => act(it.id, "DELETE", `/api/uploads/${it.id}`)}
                    aria-label={it.stage === "queued" ? "Anuluj" : "Usuń"}
                    title={it.stage === "queued" ? "Anuluj" : "Usuń"}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                )}
                {active && it.stage !== "queued" && <span className="sr-only">W toku</span>}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
