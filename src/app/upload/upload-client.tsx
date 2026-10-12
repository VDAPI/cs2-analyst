"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button, Badge } from "@/components/ui";
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  ExternalLink,
  X,
  ListOrdered,
} from "lucide-react";
import { mapDisplayName } from "@/lib/utils/mapNames";

export interface FaceitSlot {
  id: string; // FaceitMatch.id
  map: string;
  score: string;
  date: string; // ISO
  faceitUrl: string;
}

type ItemStatus = "pending" | "uploading" | "queued" | "parsing" | "done" | "error";

interface Item {
  key: string;
  file: File;
  /** FaceitMatch.id this demo belongs to (FACEIT slot). */
  faceitMatch?: string;
  status: ItemStatus;
  uploadPct: number;
  uploadId?: string;
  matchId?: string;
  error?: string;
}

interface Props {
  faceitSlots: FaceitSlot[];
  defaultKeepDemo: boolean;
  /** Files accepted in one go (plan batch size, capped by what's left this month). */
  maxFiles: number;
  remaining: number;
  monthlyLimit: number;
}

const isDem = (f: File) => f.name.toLowerCase().endsWith(".dem");

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** POST one demo with upload progress (fetch can't report it). */
function sendUpload(
  item: Item,
  keepDemo: boolean,
  onProgress: (pct: number) => void
): Promise<{ uploadId: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", item.file);
    if (keepDemo) form.append("keepDemo", "true");
    if (item.faceitMatch) form.append("faceitMatch", item.faceitMatch);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { uploadId?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.uploadId) {
        resolve({ uploadId: data.uploadId });
      } else {
        reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(form);
  });
}

export function UploadClient({
  faceitSlots,
  defaultKeepDemo,
  maxFiles,
  remaining,
  monthlyLimit,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [keepDemo, setKeepDemo] = useState(defaultKeepDemo);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keyRef = useRef(0);

  const update = useCallback((key: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const itemsRef = useRef<Item[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const addFiles = useCallback(
    (files: File[], faceitMatch?: string) => {
      const dems = files.filter(isDem);
      // A FACEIT slot holds one file: replace what was there.
      const base = faceitMatch
        ? itemsRef.current.filter((it) => it.faceitMatch !== faceitMatch)
        : itemsRef.current;
      const room = Math.max(0, maxFiles - base.length);
      if (dems.length < files.length) {
        setNotice("Only .dem files are accepted.");
      } else if (dems.length > room) {
        setNotice(
          room === 0
            ? `You can add up to ${maxFiles} demo${maxFiles === 1 ? "" : "s"} at once.`
            : `Only the first ${room} file${room === 1 ? "" : "s"} were added (limit ${maxFiles}).`
        );
      } else {
        setNotice("");
      }
      const added = dems.slice(0, room).map<Item>((file) => ({
        key: `f${keyRef.current++}`,
        file,
        faceitMatch,
        status: "pending",
        uploadPct: 0,
      }));
      setItems([...base, ...added]);
    },
    [maxFiles]
  );

  const remove = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key));

  // One poll loop for every upload waiting on the worker.
  const ensurePolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      let active = 0;
      await Promise.all(
        itemsRef.current
          .filter((it) => it.uploadId && (it.status === "queued" || it.status === "parsing"))
          .map(async (it) => {
            active++;
            try {
              const res = await fetch(`/api/uploads/${it.uploadId}/status`);
              if (!res.ok) return;
              const data = await res.json();
              if (data.status === "PARSING") update(it.key, { status: "parsing" });
              else if (data.status === "COMPLETED" && data.matchId)
                update(it.key, { status: "done", matchId: data.matchId });
              else if (data.status === "FAILED")
                update(it.key, { status: "error", error: data.error ?? "Parsing failed" });
            } catch {
              // retry on next poll
            }
          })
      );
      if (active === 0 && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2500);
  }, [update]);

  const startAll = async () => {
    setRunning(true);
    setNotice("");
    // Sequential: demos are big, parallel uploads just compete for bandwidth.
    for (const it of items.filter((i) => i.status === "pending" || i.status === "error")) {
      update(it.key, { status: "uploading", uploadPct: 0, error: undefined });
      try {
        const { uploadId } = await sendUpload(it, keepDemo, (pct) =>
          update(it.key, { uploadPct: pct })
        );
        update(it.key, { status: "queued", uploadId });
        ensurePolling();
      } catch (err) {
        update(it.key, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }
    setRunning(false);
  };

  // A single plain upload keeps the old behaviour: open the match when ready.
  const single = items.length === 1 && faceitSlots.length === 0 ? items[0] : null;
  useEffect(() => {
    if (single?.status === "done" && single.matchId) {
      const t = setTimeout(() => router.push(`/matches/${single.matchId}`), 1000);
      return () => clearTimeout(t);
    }
  }, [single?.status, single?.matchId, router]);

  const pending = items.filter((i) => i.status === "pending" || i.status === "error").length;
  const started = items.some((i) => i.uploadId);
  const allSettled = items.length > 0 && items.every((i) => i.status === "done" || i.status === "error");
  const generalItems = items.filter((i) => !i.faceitMatch);

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 py-6 sm:px-6">
      <div className="mb-4 w-full max-w-xl">
        <Link
          href="/matches"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to matches
        </Link>
      </div>
      <Card className="w-full max-w-xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 py-2 sm:py-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-muted)]">
              <Upload className="h-7 w-7 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Upload Demos</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Any CS2 .dem file: FACEIT, Premier, scrims. Up to {maxFiles} at once.
              </p>
              {Number.isFinite(monthlyLimit) && (
                <p className="mt-1 font-mono text-xs text-[var(--text-tertiary)]">
                  {remaining}/{monthlyLimit} analyses left this month
                </p>
              )}
            </div>
          </div>

          {/* FACEIT matches picked in the history */}
          {faceitSlots.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Your selected FACEIT matches
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">
                Open each match room, use &quot;Watch demo&quot; to download it, then drop the
                file in its slot.
              </p>
              {faceitSlots.map((slot) => {
                const item = items.find((i) => i.faceitMatch === slot.id);
                const [s1, s2] = slot.score.split("-");
                return (
                  <div
                    key={slot.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {mapDisplayName(slot.map)}{" "}
                          <span className="font-mono text-[var(--text-secondary)]">
                            {s1}:{s2}
                          </span>
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {new Date(slot.date).toLocaleDateString()}
                        </p>
                      </div>
                      <a
                        href={slot.faceitUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-[rgba(255,85,0,0.15)] px-3 text-xs font-medium text-[#ff5500] hover:bg-[rgba(255,85,0,0.25)]"
                      >
                        Download demo from FACEIT <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    {item ? (
                      <ItemRow item={item} onRemove={running ? undefined : () => remove(item.key)} />
                    ) : (
                      <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border)] px-3 py-3 text-xs text-[var(--text-secondary)] hover:border-[var(--border-hover)]">
                        <Upload className="h-4 w-4" /> Choose this match&apos;s .dem
                        <input
                          type="file"
                          accept=".dem"
                          className="hidden"
                          onChange={(e) => addFiles(Array.from(e.target.files ?? []), slot.id)}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Drop zone for any demos */}
          {!running && (
            <label
              className={`flex w-full cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors sm:px-6 sm:py-10 ${
                isDragging
                  ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                  : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-hover)]"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                addFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <Upload className="mb-3 h-8 w-8 text-[var(--text-disabled)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                {faceitSlots.length > 0 ? "Other demos: drag & drop here" : "Drag & drop .dem files here"}
              </p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                or tap to browse — max 700 MB each
              </p>
              <input
                type="file"
                accept=".dem"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </label>
          )}

          {generalItems.length > 0 && (
            <div className="space-y-2">
              {generalItems.map((it) => (
                <ItemRow
                  key={it.key}
                  item={it}
                  onRemove={running || it.uploadId ? undefined : () => remove(it.key)}
                />
              ))}
            </div>
          )}

          {notice && (
            <p className="flex items-center gap-1.5 text-xs text-[var(--warning)]">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {notice}
            </p>
          )}

          {pending > 0 && (
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--accent)]"
                  checked={keepDemo}
                  onChange={(e) => setKeepDemo(e.target.checked)}
                  disabled={running}
                />
                Keep the demo files. By default a demo is deleted once it&apos;s analyzed; the
                report and the 2D replay stay.
              </label>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={startAll}
                disabled={running}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Upload & Analyze{pending > 1 ? ` (${pending})` : ""}
              </Button>
            </div>
          )}

          {started && !single && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/queue" className="flex-1">
                <Button variant="secondary" className="w-full">
                  <ListOrdered className="h-4 w-4" /> Analysis queue
                </Button>
              </Link>
              {allSettled && (
                <Link href="/library" className="flex-1">
                  <Button variant="secondary" className="w-full">
                    Library
                  </Button>
                </Link>
              )}
            </div>
          )}

          {items.length === 0 && (
            <div className="flex flex-wrap justify-center gap-2">
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

function ItemRow({ item, onRemove }: { item: Item; onRemove?: () => void }) {
  const label: Record<ItemStatus, string> = {
    pending: formatSize(item.file.size),
    uploading: `Uploading ${item.uploadPct}%`,
    queued: "Queued for analysis",
    parsing: "Analyzing…",
    done: "Done",
    error: item.error ?? "Failed",
  };
  const busy = item.status === "uploading" || item.status === "queued" || item.status === "parsing";
  return (
    <div className="mt-2 flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      {item.status === "done" ? (
        <CheckCircle className="h-6 w-6 flex-shrink-0 text-[var(--success)]" />
      ) : item.status === "error" ? (
        <AlertCircle className="h-6 w-6 flex-shrink-0 text-[var(--error)]" />
      ) : busy ? (
        <Loader2 className="h-6 w-6 flex-shrink-0 animate-spin text-[var(--accent)]" />
      ) : (
        <FileText className="h-6 w-6 flex-shrink-0 text-[var(--accent)]" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{item.file.name}</p>
        <p
          className={`truncate text-xs ${item.status === "error" ? "text-[var(--error)]" : "text-[var(--text-tertiary)]"}`}
        >
          {label[item.status]}
        </p>
        {item.status === "uploading" && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: `${item.uploadPct}%` }}
            />
          </div>
        )}
      </div>
      {item.status === "done" && item.matchId && (
        <Link
          href={`/matches/${item.matchId}`}
          className="text-xs font-medium text-[var(--accent-hover)] hover:underline"
        >
          Open
        </Link>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${item.file.name}`}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--error)]"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
