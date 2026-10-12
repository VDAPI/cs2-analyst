"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Link2, Loader2, Play, RefreshCw, Trash2, Upload } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  buttonVariants,
  useToast,
} from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { formatDate, formatDateTime } from "@/lib/utils/formatters";

export interface PremierRow {
  id: string;
  shareCode: string;
  hasReplayUrl: boolean;
  createdAt: string;
  state: "new" | "queued" | "done" | "failed";
  matchId: string | null;
}

interface Props {
  rows: PremierRow[];
  steamLinked: boolean;
  historyOn: boolean;
  lastSync: string | null;
}

const AUTH_CODE_HELP = "https://help.steampowered.com/en/wizard/HelpWithGameIssue/?appid=730&issueid=128";

/** API error code → message key (the routes answer with `code`). */
const ERROR_KEYS: Record<string, MessageKey> = {
  invalid_share_code: "premier.invalidShareCode",
  invalid_replay_url: "premier.invalidReplayUrl",
  replay_mismatch: "premier.replayMismatch",
  invalid_auth_code: "premier.invalidAuthCode",
  no_steam: "premier.historyNeedsSteam",
  no_api_key: "premier.errNoApiKey",
  invalid_auth: "premier.errInvalidAuth",
  rate_limited: "premier.errRateLimited",
  steam_error: "premier.errSteam",
  limit: "premier.limitReached",
};

const STATE_BADGE: Record<
  PremierRow["state"],
  { key: MessageKey; variant: "neutral" | "warning" | "success" | "error" }
> = {
  new: { key: "premier.stateNew", variant: "neutral" },
  queued: { key: "premier.stateQueued", variant: "warning" },
  done: { key: "premier.stateDone", variant: "success" },
  failed: { key: "premier.stateFailed", variant: "error" },
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as {
    code?: string;
    added?: number;
    uploadId?: string;
  };
  return { ok: res.ok, data };
}

export function PremierClient({ rows, steamLinked, historyOn, lastSync }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();

  const errorText = (code?: string) => t(ERROR_KEYS[code ?? ""] ?? "common.error");

  // ─── Add by share code ─────────────────────────────
  const [shareCode, setShareCode] = useState("");
  const [replayUrl, setReplayUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError("");
    try {
      const { ok, data } = await send("/api/steam/matches", "POST", {
        shareCode,
        replayUrl: replayUrl.trim() || undefined,
      });
      if (!ok) {
        setAddError(errorText(data.code));
        return;
      }
      setShareCode("");
      setReplayUrl("");
      toast({ title: t("premier.added"), variant: "success" });
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  // ─── Steam history (opt-in) ────────────────────────
  const [authCode, setAuthCode] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [historyBusy, setHistoryBusy] = useState<"enable" | "sync" | "disable" | null>(null);
  const [historyError, setHistoryError] = useState("");

  async function enableHistory(e: React.FormEvent) {
    e.preventDefault();
    setHistoryBusy("enable");
    setHistoryError("");
    try {
      const { ok, data } = await send("/api/steam/history", "PUT", { authCode, shareCode: lastCode });
      if (!ok) {
        setHistoryError(errorText(data.code));
        if (data.code !== "invalid_auth") router.refresh();
        return;
      }
      setAuthCode("");
      setLastCode("");
      toast({ title: t("premier.syncDone", { n: data.added ?? 0 }), variant: "success" });
      router.refresh();
    } finally {
      setHistoryBusy(null);
    }
  }

  async function sync() {
    setHistoryBusy("sync");
    setHistoryError("");
    try {
      const { ok, data } = await send("/api/steam/sync", "POST");
      if (!ok) setHistoryError(errorText(data.code));
      else toast({ title: t("premier.syncDone", { n: data.added ?? 0 }), variant: "success" });
      router.refresh();
    } finally {
      setHistoryBusy(null);
    }
  }

  async function disableHistory() {
    setHistoryBusy("disable");
    try {
      await send("/api/steam/history", "DELETE");
      toast({ title: t("premier.disabled"), variant: "info" });
      router.refresh();
    } finally {
      setHistoryBusy(null);
    }
  }

  // ─── Rows ──────────────────────────────────────────
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function analyze(row: PremierRow) {
    setRowBusy(row.id);
    try {
      const { ok, data } = await send(`/api/steam/matches/${row.id}/analyze`, "POST", {});
      if (!ok) {
        toast({ title: errorText(data.code), variant: "error" });
        return;
      }
      toast({ title: t("premier.queued"), variant: "success" });
      router.refresh();
    } finally {
      setRowBusy(null);
    }
  }

  async function remove(row: PremierRow) {
    if (!window.confirm(t("premier.removeConfirm"))) return;
    setRowBusy(row.id);
    try {
      await send(`/api/steam/matches/${row.id}`, "DELETE");
      router.refresh();
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Add a match */}
      <Card>
        <CardHeader title={t("premier.addTitle")} description={t("premier.addDescription")} />
        <form onSubmit={add} className="space-y-3">
          <div>
            <label htmlFor="share-code" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
              {t("premier.shareCode")}
            </label>
            <Input
              id="share-code"
              value={shareCode}
              onChange={(e) => setShareCode(e.target.value)}
              placeholder={t("premier.shareCodePlaceholder")}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>
          <div>
            <label htmlFor="replay-url" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
              {t("premier.replayUrl")}
            </label>
            <Input
              id="replay-url"
              type="url"
              value={replayUrl}
              onChange={(e) => setReplayUrl(e.target.value)}
              placeholder={t("premier.replayUrlPlaceholder")}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">{t("premier.replayUrlHint")}</p>
          </div>
          {addError && (
            <p role="alert" className="text-sm text-[var(--mistake)]">
              {addError}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={adding || !shareCode.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {adding ? t("premier.adding") : t("premier.add")}
          </Button>
        </form>
      </Card>

      {/* Steam history */}
      <Card>
        <CardHeader
          title={t("premier.historyTitle")}
          description={t("premier.historyDescription")}
          action={historyOn ? <Badge variant="success">{t("premier.historyOn")}</Badge> : undefined}
        />
        {!steamLinked ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">{t("premier.historyNeedsSteam")}</p>
            <Link href="/settings" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {t("premier.goToSettings")}
            </Link>
          </div>
        ) : historyOn ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              {lastSync ? t("premier.lastSync", { date: formatDateTime(lastSync) }) : t("premier.neverSynced")}
            </p>
            {historyError && (
              <p role="alert" className="text-sm text-[var(--mistake)]">
                {historyError}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="primary" onClick={sync} disabled={historyBusy !== null}>
                <RefreshCw className={`h-4 w-4 ${historyBusy === "sync" ? "animate-spin" : ""}`} aria-hidden />
                {historyBusy === "sync" ? t("premier.syncing") : t("premier.sync")}
              </Button>
              <Button variant="ghost" onClick={disableHistory} disabled={historyBusy !== null}>
                {t("premier.disable")}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={enableHistory} className="space-y-3">
            <div>
              <label htmlFor="auth-code" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
                {t("premier.authCode")}
              </label>
              <Input
                id="auth-code"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder={t("premier.authCodePlaceholder")}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                required
              />
              <a
                href={AUTH_CODE_HELP}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] md:min-h-0"
              >
                {t("premier.authCodeHelp")} <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </div>
            <div>
              <label htmlFor="last-code" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
                {t("premier.lastShareCode")}
              </label>
              <Input
                id="last-code"
                value={lastCode}
                onChange={(e) => setLastCode(e.target.value)}
                placeholder={t("premier.shareCodePlaceholder")}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            {historyError && (
              <p role="alert" className="text-sm text-[var(--mistake)]">
                {historyError}
              </p>
            )}
            <Button type="submit" variant="secondary" disabled={historyBusy !== null}>
              {historyBusy === "enable" ? t("premier.enabling") : t("premier.enable")}
            </Button>
          </form>
        )}
      </Card>

      {/* Matches */}
      <Card className="lg:col-span-2">
        <CardHeader title={t("premier.listTitle")} />
        {rows.length === 0 ? (
          <EmptyState title={t("premier.listEmpty")} />
        ) : (
          <ul className="divide-y divide-[var(--divider)]">
            {rows.map((row) => {
              const badge = STATE_BADGE[row.state];
              const busy = rowBusy === row.id;
              return (
                <li key={row.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm text-[var(--text-primary)]">{row.shareCode}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
                      <Badge variant={badge.variant}>{t(badge.key)}</Badge>
                      <span>{t("premier.addedOn", { date: formatDate(row.createdAt) })}</span>
                      {row.hasReplayUrl && (
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="h-3 w-3" aria-hidden /> {t("premier.hasReplayUrl")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {row.state === "done" && row.matchId ? (
                      <Link
                        href={`/matches/${row.matchId}`}
                        className={buttonVariants({ variant: "primary", size: "sm" })}
                      >
                        {t("premier.openMatch")}
                      </Link>
                    ) : row.state === "queued" ? (
                      <Link href="/queue" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        {t("nav.queue")}
                      </Link>
                    ) : row.hasReplayUrl ? (
                      <Button variant="primary" size="sm" onClick={() => analyze(row)} disabled={busy}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                        {t("premier.analyze")}
                      </Button>
                    ) : (
                      <Link
                        href={`/upload?steam=${row.id}`}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        <Upload className="h-3.5 w-3.5" aria-hidden />
                        {t("premier.uploadDemo")}
                      </Link>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(row)}
                      disabled={busy}
                      aria-label={t("common.remove")}
                      title={t("common.remove")}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
