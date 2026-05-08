"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button, Badge } from "@/components/ui";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, ArrowLeft } from "lucide-react";

type UploadStatus = "idle" | "uploading" | "queued" | "parsing" | "done" | "error";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.endsWith(".dem")) {
      setFile(droppedFile);
      setError("");
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile?.name.endsWith(".dem")) {
        setFile(selectedFile);
        setError("");
      }
    },
    []
  );

  function startPolling(uploadId: string) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/uploads/${uploadId}/status`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "PARSING") {
          setStatus("parsing");
        } else if (data.status === "COMPLETED" && data.matchId) {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("done");
          setTimeout(() => router.push(`/matches/${data.matchId}`), 1000);
        } else if (data.status === "FAILED") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("error");
          setError(data.error ?? "Parsing failed");
        }
      } catch {
        // retry on next poll
      }
    }, 2500);
  }

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Upload failed");
        setStatus("error");
        return;
      }

      const { uploadId } = await res.json();
      setStatus("queued");
      startPolling(uploadId);
    } catch {
      setError("Upload failed — check your connection");
      setStatus("error");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const reset = () => {
    setFile(null);
    setStatus("idle");
    setError("");
    if (pollRef.current) clearInterval(pollRef.current);
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6">
      <div className="mb-4 w-full max-w-lg">
        <Link
          href="/matches"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to matches
        </Link>
      </div>
      <Card className="w-full max-w-lg">
        <div className="flex flex-col items-center gap-4 py-6">
          {/* Icon */}
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-muted)]">
            <Upload className="h-7 w-7 text-[var(--accent)]" />
          </div>

          <div className="text-center">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              Upload Demo
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Upload a CS2 .dem file to analyze
            </p>
          </div>

          {/* Drop zone */}
          {!file && status === "idle" && (
            <label
              className={`mt-2 flex w-full cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
                isDragging
                  ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                  : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-hover)]"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className="mb-3 h-8 w-8 text-[var(--text-disabled)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                Drag & drop .dem file here
              </p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                or click to browse — max 700 MB
              </p>
              <input
                type="file"
                accept=".dem"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
          )}

          {/* File preview */}
          {file && status === "idle" && (
            <div className="mt-2 flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <FileText className="h-8 w-8 text-[var(--accent)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {file.name}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {formatSize(file.size)}
                </p>
              </div>
              <button
                onClick={() => setFile(null)}
                className="text-xs text-[var(--text-tertiary)] hover:text-[var(--error)]"
              >
                Remove
              </button>
            </div>
          )}

          {/* Progress */}
          {(status === "uploading" || status === "queued" || status === "parsing") && (
            <div className="mt-2 w-full space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
                <span className="text-sm text-[var(--text-secondary)]">
                  {status === "uploading" && "Uploading file..."}
                  {status === "queued" && "Queued for parsing..."}
                  {status === "parsing" && "Parsing demo..."}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                  style={{
                    width:
                      status === "uploading" ? "30%" :
                      status === "queued" ? "45%" :
                      status === "parsing" ? "75%" : "0%",
                  }}
                />
              </div>
            </div>
          )}

          {/* Success */}
          {status === "done" && (
            <div className="mt-2 flex w-full items-center gap-3 rounded-lg border border-[var(--success)] bg-[var(--success-muted)] p-4">
              <CheckCircle className="h-5 w-5 text-[var(--success)]" />
              <div>
                <p className="text-sm font-medium text-[var(--success)]">
                  Demo parsed successfully!
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Redirecting to match details...
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="mt-2 w-full space-y-3">
              <div className="flex w-full items-center gap-3 rounded-lg border border-[var(--error)] bg-[var(--error-muted)] p-4">
                <AlertCircle className="h-5 w-5 text-[var(--error)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--error)]">
                    Upload failed
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {error || "Please try again or check the file format."}
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="md" className="w-full" onClick={reset}>
                Try again
              </Button>
            </div>
          )}

          {/* Action button */}
          {file && status === "idle" && (
            <Button
              variant="primary"
              size="lg"
              className="mt-2 w-full"
              onClick={handleUpload}
            >
              Upload & Analyze
            </Button>
          )}

          {/* Info */}
          {status === "idle" && (
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Badge variant="neutral">CSTV Demos</Badge>
              <Badge variant="neutral">POV Demos (limited)</Badge>
              <Badge variant="neutral">FACEIT</Badge>
              <Badge variant="neutral">Matchmaking</Badge>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
