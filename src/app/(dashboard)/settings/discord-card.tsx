"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, MessageCircle, RefreshCw, Send, Unlink } from "lucide-react";
import { Badge, Button, Card, CardHeader, Checkbox, Input, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

export interface DiscordSettings {
  /** Discord display name of the linked account, null when not linked. */
  username: string | null;
  notify: boolean;
  /** Masked webhook (no token), null when none. */
  webhook: string | null;
  /** DISCORD_BOT_TOKEN is set on the server. */
  botConfigured: boolean;
}

/** Settings → Discord (S26): link the bot with a one-time code, notifications, channel webhook, test. */
export function DiscordCard({ settings }: { settings: DiscordSettings }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [notify, setNotify] = useState(settings.notify);
  const [webhook, setWebhook] = useState(settings.webhook);
  const [webhookInput, setWebhookInput] = useState("");
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linked = settings.username != null;

  async function request(url: string, init: RequestInit): Promise<Response | null> {
    setBusy(true);
    try {
      return await fetch(url, init);
    } catch {
      toast({ title: t("common.error"), variant: "error" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function newCode() {
    const res = await request("/api/discord/link", { method: "POST" });
    if (!res) return;
    if (!res.ok) return toast({ title: t("common.error"), variant: "error" });
    const data = (await res.json()) as { code: string };
    setCode(data.code);
  }

  async function copyCommand() {
    if (!code) return;
    const command = t("discordSettings.command", { code });
    try {
      await navigator.clipboard.writeText(command);
      toast({ title: t("discordSettings.copied"), variant: "success" });
    } catch {
      toast({ title: command, variant: "info" });
    }
  }

  async function unlink() {
    const res = await request("/api/discord/link", { method: "DELETE" });
    if (!res?.ok) return;
    setCode(null);
    toast({ title: t("discordSettings.unlinked"), variant: "success" });
    router.refresh();
  }

  async function saveSettings(body: { notify?: boolean; webhookUrl?: string | null }): Promise<boolean> {
    const res = await request("/api/discord/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res) return false;
    if (res.status === 400) {
      setWebhookError(t("discordSettings.webhookInvalid"));
      return false;
    }
    if (!res.ok) {
      toast({ title: t("common.error"), variant: "error" });
      return false;
    }
    const data = (await res.json()) as { notify: boolean; webhook: string | null };
    setNotify(data.notify);
    setWebhook(data.webhook);
    setWebhookError(null);
    return true;
  }

  async function sendTest() {
    const res = await request("/api/discord/test", { method: "POST" });
    if (!res) return;
    const data = (await res.json().catch(() => ({}))) as { dm?: boolean; webhook?: boolean; dmError?: string | null };
    if (data.dm || data.webhook) toast({ title: t("discordSettings.testSent"), variant: "success" });
    else if (data.dmError === "cannot_dm") toast({ title: t("discordSettings.testCannotDm"), variant: "error", duration: 10000 });
    else if (!linked && !webhook) toast({ title: t("discordSettings.testNothing"), variant: "info" });
    else toast({ title: t("discordSettings.testFailed"), variant: "error" });
  }

  return (
    <Card id="discord" className="scroll-mt-20">
      <CardHeader
        title={t("discordSettings.title")}
        description={t("discordSettings.description")}
        action={
          <Badge variant={linked ? "success" : "default"}>
            {linked ? t("discordSettings.linkedAs", { name: settings.username ?? "" }) : t("discordSettings.notLinked")}
          </Badge>
        }
      />
      <div className="space-y-4">
        {!settings.botConfigured && <p className="text-sm text-[var(--warning)]">{t("discordSettings.botOff")}</p>}

        {linked ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button variant="secondary" onClick={unlink} disabled={busy}>
              <Unlink className="h-4 w-4" aria-hidden /> {t("discordSettings.unlink")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {code ? (
              <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-3">
                <p className="text-sm text-[var(--text-secondary)]">{t("discordSettings.codeHint")}</p>
                <p className="break-all font-mono text-lg text-[var(--accent-2)]">{t("discordSettings.command", { code })}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{t("discordSettings.codeExpires")}</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button variant="primary" onClick={copyCommand}>
                    <Copy className="h-4 w-4" aria-hidden /> {t("discordSettings.copy")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      router.refresh();
                      toast({ title: t("discordSettings.stillWaiting"), variant: "info" });
                    }}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden /> {t("discordSettings.refresh")}
                  </Button>
                  <Button variant="ghost" onClick={newCode} disabled={busy}>
                    {t("discordSettings.newCode")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="primary" onClick={newCode} disabled={busy}>
                <MessageCircle className="h-4 w-4" aria-hidden /> {t("discordSettings.connect")}
              </Button>
            )}
          </div>
        )}

        <p className="text-xs text-[var(--text-tertiary)]">
          {t("discordSettings.commands")}. {t("discordSettings.dmHint")}
        </p>

        <Checkbox
          id="discord-notify"
          checked={notify}
          disabled={busy}
          onChange={(e) => void saveSettings({ notify: e.target.checked })}
          label={t("discordSettings.notify")}
        />

        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await saveSettings({ webhookUrl: webhookInput })) {
              setWebhookInput("");
              toast({ title: t("discordSettings.webhookSaved"), variant: "success" });
            }
          }}
        >
          <p className="text-sm font-medium text-[var(--text-primary)]">{t("discordSettings.webhookTitle")}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{t("discordSettings.webhookHint")}</p>
          {webhook && (
            <p className="break-all font-mono text-xs text-[var(--text-secondary)]">
              {t("discordSettings.webhookCurrent", { url: webhook })}
            </p>
          )}
          <Input
            value={webhookInput}
            onChange={(e) => {
              setWebhookInput(e.target.value);
              setWebhookError(null);
            }}
            placeholder={t("discordSettings.webhookPlaceholder")}
            aria-label={t("discordSettings.webhookTitle")}
            inputMode="url"
            autoComplete="off"
          />
          {webhookError && <p className="text-sm text-[var(--mistake)]">{webhookError}</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="submit" variant="secondary" disabled={busy || webhookInput.trim() === ""}>
              {t("discordSettings.webhookSave")}
            </Button>
            {webhook && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (await saveSettings({ webhookUrl: null })) toast({ title: t("discordSettings.webhookRemoved"), variant: "success" });
                }}
              >
                {t("discordSettings.webhookRemove")}
              </Button>
            )}
            {(linked || webhook) && (
              <Button type="button" variant="ghost" onClick={sendTest} disabled={busy}>
                <Send className="h-4 w-4" aria-hidden /> {t("discordSettings.test")}
              </Button>
            )}
          </div>
        </form>
      </div>
    </Card>
  );
}
