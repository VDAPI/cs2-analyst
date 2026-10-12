"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bell, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n/translate";
import {
  notificationView,
  toNotificationData,
  type NotificationKind,
} from "@/lib/notifications/text";
import { formatDate } from "@/lib/utils/formatters";

interface Item {
  id: string;
  type: NotificationKind;
  matchId: string | null;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}

const POLL_MS = 60_000;

function timeAgo(t: TFunction, iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return t("notifications.justNow");
  if (min < 60) return t("notifications.minutesAgo", { n: min });
  if (min < 24 * 60) return t("notifications.hoursAgo", { n: Math.floor(min / 60) });
  return formatDate(iso);
}

/** Top bar bell: "analysis ready / failed" list (S18). Polls, and refreshes on push. */
export function NotificationBell() {
  const t = useT();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Item[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      // offline — keep what we have
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    const onSwMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "notification") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [status, load]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }

  async function markRead(id: string) {
    const item = items.find((n) => n.id === id);
    if (!item || item.readAt) return;
    setUnread((u) => Math.max(0, u - 1));
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => {});
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? t("notifications.unread", { count: unread }) : t("notifications.open")}
        className="relative flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(190,160,255,0.06)] hover:text-[var(--text-secondary)] md:h-9 md:w-9"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-2)] px-1 font-mono text-[10px] font-bold leading-none text-[var(--on-accent)] md:right-0.5 md:top-0.5">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("notifications.title")}
          className="fixed inset-x-2 top-[calc(var(--topbar-height)+4px)] z-50 rounded-xl border border-[var(--border-hover)] bg-[var(--surface-2)] shadow-[var(--shadow-md)] animate-scale-in sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <p className="font-display text-sm font-semibold text-[var(--text-primary)]">
              {t("notifications.title")}
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="min-h-11 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] md:min-h-0"
              >
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
              {t("notifications.empty")}
            </p>
          ) : (
            <ul className="max-h-[min(420px,60dvh)] overflow-y-auto py-1">
              {items.map((n) => {
                const view = notificationView(t, {
                  type: n.type,
                  matchId: n.matchId,
                  data: toNotificationData(n.data),
                });
                const ok = n.type === "ANALYSIS_DONE";
                const Icon = ok ? CheckCircle : AlertCircle;
                return (
                  <li key={n.id}>
                    <Link
                      href={view.url}
                      onClick={() => {
                        void markRead(n.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-3)]",
                        !n.readAt && "bg-[rgba(155,107,255,0.06)]"
                      )}
                    >
                      <Icon
                        aria-hidden
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          ok ? "text-[var(--good)]" : "text-[var(--mistake)]"
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                            {view.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">
                            {timeAgo(t, n.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                          {view.body}
                        </span>
                      </span>
                      {!n.readAt && (
                        <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent-2)]" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-[var(--border)] px-4 py-2">
            <Link
              href="/queue"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-11 items-center text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] md:min-h-0"
            >
              {t("notifications.seeQueue")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
