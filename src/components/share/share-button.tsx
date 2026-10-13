"use client";

import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import type { ClipShare } from "@/lib/clips/clip";

export type ShareRequest =
  | { kind: "report"; matchId: string; steamId: string }
  | { kind: "moment"; matchId: string; steamId?: string | null; round: number; tick: number }
  | { kind: "clip"; matchId: string; steamId: string; round: number; clip: ClipShare };

/** Creates (or reuses) a public link and returns its full URL. */
export async function createShareLink(body: ShareRequest): Promise<string> {
  const res = await fetch("/api/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`share ${res.status}`);
  const { path } = (await res.json()) as { path: string };
  return new URL(path, window.location.origin).toString();
}

/**
 * Hands a link to the system share sheet on phones, else copies it. Returns
 * false when neither worked (the caller shows the link instead).
 */
export async function shareOrCopy(url: string, title: string): Promise<boolean> {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return true;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/** "Share" button for a report: public link, share sheet or clipboard, then a toast. */
export function ShareButton({
  request,
  label,
  hint,
  variant = "secondary",
}: {
  request: ShareRequest;
  label?: string;
  /** Toast text after the link is copied. */
  hint?: string;
  variant?: "secondary" | "ghost";
}) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const url = await createShareLink(request);
      const ok = await shareOrCopy(url, t("share.shareSheetTitle"));
      toast(
        ok
          ? { title: t("share.copied"), description: hint ?? t("share.reportHint"), variant: "success" }
          : { title: t("share.copyFailed", { url }), variant: "info", duration: 15000 }
      );
    } catch {
      toast({ title: t("share.failed"), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant={variant} size="sm" onClick={onClick} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Share2 className="h-3.5 w-3.5" aria-hidden />}
      {busy ? t("share.creating") : label ?? t("share.button")}
    </Button>
  );
}
