"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Clock, FileText, Hourglass, Loader2, RotateCcw } from "lucide-react";
import { Badge, Button, Card, EmptyState, useToast, type BadgeProps } from "@/components/ui";
import { MapThumb, SourceBadge } from "@/components/match";
import { formatDateTime } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { formatDuration } from "@/lib/admin/metrics";
import type { AdminUploadRow } from "@/lib/admin/data";
import type { ParseStatus } from "@prisma/client";

const STATUS_LABEL: Record<ParseStatus, string> = {
  QUEUED: "W kolejce",
  DOWNLOADING: "Pobieranie",
  PARSING: "Analizowanie",
  COMPLETED: "Gotowe",
  FAILED: "Błąd",
};

const STATUS_BADGE: Record<ParseStatus, NonNullable<BadgeProps["variant"]>> = {
  QUEUED: "neutral",
  DOWNLOADING: "default",
  PARSING: "default",
  COMPLETED: "success",
  FAILED: "error",
};

function borderFor(row: AdminUploadRow) {
  if (row.status === "FAILED") return "var(--mistake)";
  if (row.stuck) return "var(--warning)";
  if (row.status === "COMPLETED") return "var(--good)";
  return "var(--accent)";
}

/** Failed / stuck / recent analyses of every player, with a retry button. */
export function AdminAnalysesList({ rows, emptyTitle }: { rows: AdminUploadRow[]; emptyTitle: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function retry(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/uploads/${id}/retry`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Nie udało się ponowić", description: data.error, variant: "error" });
      } else {
        toast({ title: "Analiza wróciła do kolejki", variant: "success" });
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return <EmptyState icon={CheckCircle} title={emptyTitle} />;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const canRetry = (r.status === "FAILED" || r.stuck) && r.retryable;
        return (
          <Card key={r.id} className="border-l-[3px] p-3 sm:p-4" style={{ borderLeftColor: borderFor(r) }}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {r.map ? (
                  <MapThumb map={r.map} size="sm" />
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
                      {r.map ? mapDisplayName(r.map) : "Demo"}
                    </p>
                    <SourceBadge source={r.source} />
                    <Badge variant={STATUS_BADGE[r.status]}>
                      {r.status === "FAILED" ? (
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {STATUS_LABEL[r.status]}
                    </Badge>
                    {r.stuck && (
                      <Badge variant="warning">
                        <Hourglass className="h-3.5 w-3.5" aria-hidden />
                        Zawieszona
                      </Badge>
                    )}
                    {r.retries > 0 && (
                      <Badge variant="neutral">
                        Ponowiona <span className="font-mono tabular-nums">{r.retries}×</span>
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 break-all text-xs text-[var(--text-secondary)]">
                    <Link
                      href={`/admin/users?q=${encodeURIComponent(r.user.label)}`}
                      className="text-[var(--accent-hover)] hover:underline"
                    >
                      {r.user.label}
                    </Link>
                    <span aria-hidden> · </span>
                    {r.fileName}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                    Dodana <span className="font-mono tabular-nums">{formatDateTime(r.createdAt)}</span>
                    <span aria-hidden> · </span>
                    zmiana <span className="font-mono tabular-nums">{formatDateTime(r.updatedAt)}</span>
                    {r.parseMs != null && (
                      <>
                        <span aria-hidden> · </span>
                        parsowanie <span className="font-mono tabular-nums">{formatDuration(r.parseMs)}</span>
                      </>
                    )}
                  </p>
                  {r.error && r.status !== "COMPLETED" && (
                    <p className="mt-1.5 break-words rounded-md bg-[var(--mistake-muted)] px-2 py-1 font-mono text-xs text-[var(--mistake)]">
                      {r.error}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                {r.matchId && r.status === "COMPLETED" && (
                  <Link
                    href={`/matches/${r.matchId}`}
                    className="inline-flex h-10 items-center rounded-lg px-3 text-sm text-[var(--text-secondary)] hover:bg-[rgba(190,160,255,0.06)]"
                  >
                    Raport
                  </Link>
                )}
                {(r.status === "FAILED" || r.stuck) &&
                  (canRetry ? (
                    <Button
                      variant="primary"
                      onClick={() => retry(r.id)}
                      disabled={busyId !== null}
                      className="max-sm:w-full"
                    >
                      {busyId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <RotateCcw className="h-4 w-4" aria-hidden />
                      )}
                      Ponów
                    </Button>
                  ) : (
                    <p className="max-w-[16rem] text-xs text-[var(--text-tertiary)]">
                      {r.source === "FACEIT"
                        ? "Brak pliku, a pobieranie z FACEIT jest wyłączone. Gracz musi wgrać demo."
                        : "Demo usunięte, gracz musi wgrać je ponownie."}
                    </p>
                  ))}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
