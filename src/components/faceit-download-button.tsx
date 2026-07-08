"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Download, AlertCircle } from "lucide-react";
import type { DemoFetchStatus } from "@prisma/client";

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

          if (data.status === "QUEUED") {
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
            setError(data.error ?? "Download failed");
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
        setError(data.error ?? "Failed to start download");
        setState("error");
        return;
      }
      const { uploadId } = await res.json();
      setState("downloading");
      startPolling(uploadId);
    } catch {
      setError("Failed to start download — check your connection");
      setState("error");
    }
  };

  const busy =
    state === "starting" || state === "downloading" || state === "parsing";

  const label =
    state === "starting"
      ? "Starting…"
      : state === "downloading"
        ? "Downloading…"
        : state === "parsing"
          ? "Parsing…"
          : state === "done"
            ? "Done"
            : state === "error"
              ? "Retry"
              : "Download & Analyze";

  if (state === "error") {
    return (
      <button
        onClick={handleClick}
        title={error}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--error-muted)] px-3 text-xs font-medium text-[var(--error)] transition-colors hover:bg-[rgba(239,68,68,0.25)]"
      >
        <AlertCircle className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy || state === "done"}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  );
}
