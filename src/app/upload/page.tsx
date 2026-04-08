"use client";

import { useState, useCallback } from "react";
import { Card, Button, Badge } from "@/components/ui";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

type UploadStatus = "idle" | "uploading" | "parsing" | "done" | "error";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.endsWith(".dem")) {
      setFile(droppedFile);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile?.name.endsWith(".dem")) {
        setFile(selectedFile);
      }
    },
    []
  );

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setProgress(0);

    try {
      // TODO: Implement actual upload to R2 via presigned URL
      // 1. Get presigned URL from API
      // const { uploadUrl, uploadId } = await fetch("/api/uploads/presign", {
      //   method: "POST",
      //   body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
      // }).then((r) => r.json());

      // 2. Upload file to R2
      // await fetch(uploadUrl, { method: "PUT", body: file });

      // 3. Confirm upload & trigger parsing
      // await fetch("/api/uploads/confirm", {
      //   method: "POST",
      //   body: JSON.stringify({ uploadId }),
      // });

      // Simulate progress for now
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((r) => setTimeout(r, 200));
        setProgress(i);
        if (i === 50) setStatus("parsing");
      }

      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-6">
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
          {!file && (
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
                or click to browse — max 200 MB
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
              <div className="flex-1 min-w-0">
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
          {(status === "uploading" || status === "parsing") && (
            <div className="mt-2 w-full space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
                <span className="text-sm text-[var(--text-secondary)]">
                  {status === "uploading" ? "Uploading..." : "Parsing demo..."}
                </span>
                <span className="ml-auto font-mono text-sm text-[var(--text-tertiary)]">
                  {progress}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                  style={{ width: `${progress}%` }}
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
            <div className="mt-2 flex w-full items-center gap-3 rounded-lg border border-[var(--error)] bg-[var(--error-muted)] p-4">
              <AlertCircle className="h-5 w-5 text-[var(--error)]" />
              <div>
                <p className="text-sm font-medium text-[var(--error)]">
                  Upload failed
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Please try again or check the file format.
                </p>
              </div>
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
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Badge variant="neutral">CSTV Demos</Badge>
            <Badge variant="neutral">POV Demos (limited)</Badge>
            <Badge variant="neutral">FACEIT</Badge>
            <Badge variant="neutral">Matchmaking</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
