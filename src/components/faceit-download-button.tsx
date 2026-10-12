"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Download, AlertCircle } from "lucide-react";
import type { DemoFetchStatus } from "@prisma/client";
import { Button } from "@/components/ui";

type State = "idle" | "starting" | "downloading" | "parsing" | "done" | "error";

interface Props {
  /** FaceitMatch.id (primary key, used in the download route path). */
  faceitMatchId: string;
  demoStatus: DemoFetchStatus;
  /** Set when a download is already in flight (page loaded mid-download). */
  initialUploadId?: string | null;
}

/**
 * "Download & Analyze" button for a FACEIT match. Kicks off the automated
 * download job and reuses the existing upload status-polling endpoint,
 * redirecting to the parsed match when complete.
 */
export function FaceitDownloadButton({
  faceitMatchId,
  demoStatus,
  initialUploadId,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (uploadId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/uploads/${uploadId}/status`);
          if (!res.ok) return;
          const data = await res.json();

          if (data.status === "QUEUED" || data.status === "DOWNLOADING") {
            setState("downloading");
          } else if (data.status === "PARSING") {
            setState("parsing");
          } else if (data.status === "COMPLETED" && data.matchId) {
            stopPolling();
            setState("done");
            router.push(`/matches/${data.matchId}`);
          } else if (data.status === "FAILED") {
            stopPolling();
            setState("error");
            setError(data.error ?? "Pobieranie nie powiodło się");
          }
        } catch {
          // retry on next tick
        }
      }, 2500);
    },
    [router, stopPolling]
  );

  // Resume polling if a download was already in flight on page load.
  useEffect(() => {
    if (initialUploadId && demoStatus !== "DOWNLOADED") {
      setState("downloading");
      startPolling(initialUploadId);
    }
    return stopPolling;
  }, [initialUploadId, demoStatus, startPolling, stopPolling]);

  const handleClick = async () => {
    setState("starting");
    setError("");
    try {
      const res = await fetch(
        `/api/faceit/matches/${faceitMatchId}/download`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // No Downloads API: continue on the upload page for this match.
        if (res.status === 409 && data.uploadUrl) {
          router.push(data.uploadUrl);
          return;
        }
        setError(data.error ?? "Nie udało się rozpocząć pobierania");
        setState("error");
        return;
      }
      const { uploadId } = await res.json();
      setState("downloading");
      startPolling(uploadId);
    } catch {
      setError("Nie udało się rozpocząć pobierania — sprawdź połączenie");
      setState("error");
    }
  };

  const busy =
    state === "starting" || state === "downloading" || state === "parsing";

  const label =
    state === "starting"
      ? "Uruchamianie…"
      : state === "downloading"
        ? "Pobieranie…"
        : state === "parsing"
          ? "Analizowanie…"
          : state === "done"
            ? "Gotowe"
            : state === "error"
              ? "Ponów"
              : "Pobierz i analizuj";

  if (state === "error") {
    return (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="danger"
          onClick={handleClick}
          title={error}
          aria-label={`${label}: ${error}`}
        >
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {label}
        </Button>
        {error && (
          <span role="alert" className="min-w-0 break-words text-xs text-[var(--mistake)]">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={handleClick}
      disabled={busy || state === "done"}
      className="disabled:cursor-not-allowed disabled:opacity-70"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Download className="h-3.5 w-3.5" aria-hidden />
      )}
      {label}
    </Button>
  );
}
