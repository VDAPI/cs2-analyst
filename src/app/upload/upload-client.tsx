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
import { formatDate } from "@/lib/utils/formatters";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";

export interface FaceitSlot {
  id: string; // FaceitMatch.id
  map: string;
  score: string;
  date: string; // ISO
  faceitUrl: string;
}

export interface SteamSlot {
  id: string; // SteamMatch.id
  shareCode: string;
}

type ItemStatus = "pending" | "uploading" | "queued" | "parsing" | "done" | "error";

interface Item {
  key: string;
  file: File;
  /** FaceitMatch.id this demo belongs to (FACEIT slot). */
  faceitMatch?: string;
  /** SteamMatch.id this demo belongs to (Premier slot). */
  steamMatch?: string;
  status: ItemStatus;
  uploadPct: number;
  uploadId?: string;
  matchId?: string;
  error?: string;
}

interface Props {
  faceitSlots: FaceitSlot[];
  steamSlots: SteamSlot[];
  defaultKeepDemo: boolean;
  /** Files accepted in one go (plan batch size, capped by what's left this month). */
  maxFiles: number;
  remaining: number;
  monthlyLimit: number;
  /** Team analysis folders, as paths. */
  folders: Array<{ id: string; path: string }>;
  defaultKind: UploadKind;
  defaultFolderId: string;
}

type UploadKind = "PLAYER" | "TEAM";

const isDem = (f: File) => f.name.toLowerCase().endsWith(".dem");

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** POST one demo with upload progress (fetch can't report it). */
function sendUpload(
  t: TFunction,
  item: Item,
  keepDemo: boolean,
  onProgress: (pct: number) => void,
  team: { kind: UploadKind; folderId: string }
): Promise<{ uploadId: string; keepDemoIgnored: boolean }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", item.file);
    if (keepDemo) form.append("keepDemo", "true");
    if (team.kind === "TEAM") {
      form.append("kind", "TEAM");
      if (team.folderId) form.append("folder", team.folderId);
    }
    if (item.faceitMatch) form.append("faceitMatch", item.faceitMatch);
    if (item.steamMatch) form.append("steamMatch", item.steamMatch);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { uploadId?: string; error?: string; code?: string; keepDemoIgnored?: boolean } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.uploadId) {
        resolve({ uploadId: data.uploadId, keepDemoIgnored: data.keepDemoIgnored === true });
      } else {
        const message = data.code === "duplicate" ? t("upload.duplicate") : data.error;
        reject(new Error(message ?? t("upload.sendFailedStatus", { status: xhr.status })));
      }
    };
    xhr.onerror = () => reject(new Error(t("upload.sendFailedNetwork")));
    xhr.send(form);
  });
}

export function UploadClient({
  faceitSlots,
  steamSlots,
  defaultKeepDemo,
  maxFiles,
  remaining,
  monthlyLimit,
  folders,
  defaultKind,
  defaultFolderId,
}: Props) {
  const router = useRouter();
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);
  const [keepDemo, setKeepDemo] = useState(defaultKeepDemo);
  const [kind, setKind] = useState<UploadKind>(defaultKind);
  const [folderId, setFolderId] = useState(defaultFolderId);
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
    (files: File[], slot?: { faceitMatch?: string; steamMatch?: string }) => {
      const dems = files.filter(isDem);
      // A FACEIT / Premier slot holds one file: replace what was there.
      const base = slot?.faceitMatch
        ? itemsRef.current.filter((it) => it.faceitMatch !== slot.faceitMatch)
        : slot?.steamMatch
          ? itemsRef.current.filter((it) => it.steamMatch !== slot.steamMatch)
          : itemsRef.current;
      const room = Math.max(0, maxFiles - base.length);
      if (dems.length < files.length) {
        setNotice(t("upload.onlyDem"));
      } else if (dems.length > room) {
        setNotice(
          room === 0
            ? t("upload.maxFiles", { n: maxFiles })
            : t("upload.addedOnly", { n: room, max: maxFiles })
        );
      } else {
        setNotice("");
      }
      const added = dems.slice(0, room).map<Item>((file) => ({
        key: `f${keyRef.current++}`,
        file,
        faceitMatch: slot?.faceitMatch,
        steamMatch: slot?.steamMatch,
        status: "pending",
        uploadPct: 0,
      }));
      setItems([...base, ...added]);
    },
    [maxFiles, t]
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
                update(it.key, { status: "error", error: data.error ?? t("upload.failed") });
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
  }, [update, t]);

  const startAll = async () => {
    setRunning(true);
    setNotice("");
    // Sequential: demos are big, parallel uploads just compete for bandwidth.
    for (const it of items.filter((i) => i.status === "pending" || i.status === "error")) {
      update(it.key, { status: "uploading", uploadPct: 0, error: undefined });
      try {
        const { uploadId, keepDemoIgnored } = await sendUpload(
          t,
          it,
          keepDemo,
          (pct) => update(it.key, { uploadPct: pct }),
          { kind, folderId }
        );
        update(it.key, { status: "queued", uploadId });
        // The plan's "keep demo" cap is reached: analyzed, but the .dem goes.
        if (keepDemoIgnored) setNotice(t("upload.keepDemoCapped"));
        ensurePolling();
      } catch (err) {
        update(it.key, {
          status: "error",
          error: err instanceof Error ? err.message : t("upload.sendFailed"),
        });
      }
    }
    setRunning(false);
  };

  // A single plain upload keeps the old behaviour: open the match when ready.
  const single =
    items.length === 1 && faceitSlots.length === 0 && steamSlots.length === 0 ? items[0] : null;
  useEffect(() => {
    if (single?.status === "done" && single.matchId) {
      // A team analysis demo opens its team breakdown, not the player report.
      const href = kind === "TEAM" ? `/matches/${single.matchId}/team` : `/matches/${single.matchId}`;
      const t = setTimeout(() => router.push(href), 1000);
      return () => clearTimeout(t);
    }
  }, [single?.status, single?.matchId, router, kind]);

  const pending = items.filter((i) => i.status === "pending" || i.status === "error").length;
  const started = items.some((i) => i.uploadId);
  const allSettled = items.length > 0 && items.every((i) => i.status === "done" || i.status === "error");
  const generalItems = items.filter((i) => !i.faceitMatch && !i.steamMatch);
  const hasSlots = faceitSlots.length > 0 || steamSlots.length > 0;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <div className="mb-4 w-full max-w-xl">
        <Link
          href="/matches"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("upload.back")}
        </Link>
      </div>
      <Card className="w-full max-w-xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 py-2 sm:py-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-muted)]">
              <Upload className="h-7 w-7 text-[var(--accent)]" aria-hidden />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-[var(--text-primary)] md:text-2xl">{t("upload.title")}</h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {t("upload.subtitle", { n: maxFiles })}
              </p>
              {Number.isFinite(monthlyLimit) && (
                <p className="mt-1 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                  {t("upload.remaining", { remaining, limit: monthlyLimit })}
                </p>
              )}
            </div>
          </div>

          {/* What the demo is for: the player's own match or team analysis */}
          {!hasSlots && (
            <div className="space-y-2">
              <div role="radiogroup" aria-label={t("upload.kindLabel")} className="grid grid-cols-2 gap-2">
                {(["PLAYER", "TEAM"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    disabled={running || started}
                    onClick={() => setKind(k)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      kind === k
                        ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
                    }`}
                  >
                    <span className="block font-semibold">{k === "PLAYER" ? t("upload.kindPlayer") : t("upload.kindTeam")}</span>
                    <span className="block text-xs text-[var(--text-tertiary)]">
                      {k === "PLAYER" ? t("upload.kindPlayerHint") : t("upload.kindTeamHint")}
                    </span>
                  </button>
                ))}
              </div>
              {kind === "TEAM" && (
                <label className="block space-y-1 text-xs text-[var(--text-secondary)]">
                  {t("upload.folder")}
                  <select
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    disabled={running || started}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2 text-sm text-[var(--text-primary)]"
                  >
                    <option value="">{t("upload.noFolder")}</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.path}
                      </option>
                    ))}
                  </select>
                  <Link href="/team-analysis" className="inline-block text-[var(--accent-hover)] hover:underline">
                    {t("upload.manageFolders")}
                  </Link>
                </label>
              )}
            </div>
          )}

          {/* FACEIT matches picked in the history */}
          {faceitSlots.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {t("upload.faceitPicked")}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">{t("upload.faceitHint")}</p>
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
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                          {mapDisplayName(slot.map)}{" "}
                          <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                            {s1}:{s2}
                          </span>
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {formatDate(slot.date)}
                        </p>
                      </div>
                      <a
                        href={slot.faceitUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--faceit-muted)] px-3 text-xs font-medium text-[var(--faceit)] hover:bg-[rgba(255,85,0,0.25)] max-md:min-h-11"
                      >
                        {t("upload.faceitDownload")} <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </div>
                    {item ? (
                      <ItemRow item={item} onRemove={running ? undefined : () => remove(item.key)} />
                    ) : (
                      <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border)] px-3 py-3 text-xs text-[var(--text-secondary)] hover:border-[var(--border-hover)]">
                        <Upload className="h-4 w-4" aria-hidden /> {t("upload.pickFile")}
                        <input
                          type="file"
                          accept=".dem"
                          className="hidden"
                          onChange={(e) =>
                            addFiles(Array.from(e.target.files ?? []), { faceitMatch: slot.id })
                          }
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Premier matches picked on /premier */}
          {steamSlots.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {t("upload.steamPicked")}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">{t("upload.steamHint")}</p>
              {steamSlots.map((slot) => {
                const item = items.find((i) => i.steamMatch === slot.id);
                return (
                  <div
                    key={slot.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
                  >
                    <p className="break-all font-mono text-xs text-[var(--text-secondary)]">
                      {slot.shareCode}
                    </p>
                    {item ? (
                      <ItemRow item={item} onRemove={running ? undefined : () => remove(item.key)} />
                    ) : (
                      <label className="mt-2 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border)] px-3 py-3 text-xs text-[var(--text-secondary)] hover:border-[var(--border-hover)]">
                        <Upload className="h-4 w-4" aria-hidden /> {t("upload.pickFile")}
                        <input
                          type="file"
                          accept=".dem"
                          className="hidden"
                          onChange={(e) =>
                            addFiles(Array.from(e.target.files ?? []), { steamMatch: slot.id })
                          }
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
              <Upload className="mb-3 h-8 w-8 text-[var(--text-disabled)]" aria-hidden />
              <p className="text-sm text-[var(--text-secondary)]">
                {hasSlots ? t("upload.dropOther") : t("upload.drop")}
              </p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                {t("upload.dropHint")}
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
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden /> {notice}
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
                {t("upload.keepDemo")}
              </label>
              <Button
                variant="cta"
                size="lg"
                className="w-full"
                onClick={startAll}
                disabled={running}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pending > 1 ? t("upload.startCount", { n: pending }) : t("upload.start")}
              </Button>
            </div>
          )}

          {started && (
            <p className="text-center text-xs text-[var(--text-tertiary)]">{t("upload.notifyHint")}</p>
          )}

          {started && !single && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/queue" className="flex-1">
                <Button variant="secondary" className="w-full">
                  <ListOrdered className="h-4 w-4" aria-hidden /> {t("upload.queue")}
                </Button>
              </Link>
              {allSettled && (
                <Link href={kind === "TEAM" ? `/team-analysis${folderId ? `/${folderId}` : ""}` : "/library"} className="flex-1">
                  <Button variant="secondary" className="w-full">
                    {t("upload.library")}
                  </Button>
                </Link>
              )}
            </div>
          )}

          {items.length === 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              <Badge variant="neutral">{t("upload.badgeCstv")}</Badge>
              <Badge variant="neutral">{t("upload.badgePov")}</Badge>
              <Badge variant="neutral">{t("upload.badgeFaceit")}</Badge>
              <Badge variant="neutral">{t("upload.badgeMm")}</Badge>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ItemRow({ item, onRemove }: { item: Item; onRemove?: () => void }) {
  const t = useT();
  const label: Record<ItemStatus, string> = {
    pending: formatSize(item.file.size),
    uploading: t("upload.statusUploading", { pct: item.uploadPct }),
    queued: t("upload.statusQueued"),
    parsing: t("upload.statusParsing"),
    done: t("upload.statusDone"),
    error: item.error ?? t("upload.statusError"),
  };
  const busy = item.status === "uploading" || item.status === "queued" || item.status === "parsing";
  return (
    <div className="mt-2 flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      {item.status === "done" ? (
        <CheckCircle className="h-6 w-6 flex-shrink-0 text-[var(--good)]" aria-hidden />
      ) : item.status === "error" ? (
        <AlertCircle className="h-6 w-6 flex-shrink-0 text-[var(--mistake)]" aria-hidden />
      ) : busy ? (
        <Loader2 className="h-6 w-6 flex-shrink-0 animate-spin text-[var(--accent)]" aria-hidden />
      ) : (
        <FileText className="h-6 w-6 flex-shrink-0 text-[var(--accent)]" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{item.file.name}</p>
        <p
          className={`truncate text-xs ${item.status === "error" ? "text-[var(--mistake)]" : "text-[var(--text-tertiary)]"}`}
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
          className="inline-flex shrink-0 items-center text-xs font-medium text-[var(--accent-hover)] hover:underline max-md:min-h-11"
        >
          {t("common.open")}
        </Link>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={t("upload.removeFile", { name: item.file.name })}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--mistake)] max-md:h-11 max-md:w-11"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
