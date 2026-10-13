"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/** "Manage subscription" (Stripe portal) and "Refresh status" (sync from Stripe) on /billing. */
export function BillingActions({ portal }: { portal: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<"portal" | "sync" | null>(null);

  async function openPortal() {
    setBusy("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      toast({ title: t("billing.error"), variant: "error" });
    } catch {
      toast({ title: t("billing.error"), variant: "error" });
    }
    setBusy(null);
  }

  async function sync() {
    setBusy("sync");
    try {
      const res = await fetch("/api/billing/sync", { method: "POST" });
      if (res.ok) {
        toast({ title: t("billing.refreshed"), variant: "success" });
        router.refresh();
      } else {
        toast({ title: t("billing.error"), variant: "error" });
      }
    } catch {
      toast({ title: t("billing.error"), variant: "error" });
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {portal && (
        <Button type="button" variant="primary" size="sm" disabled={busy != null} onClick={() => void openPortal()}>
          {busy === "portal" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ExternalLink className="h-4 w-4" aria-hidden />
          )}
          {t("billing.manage")}
        </Button>
      )}
      <Button type="button" variant="secondary" size="sm" disabled={busy != null} onClick={() => void sync()}>
        <RefreshCw className={busy === "sync" ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
        {busy === "sync" ? t("billing.refreshing") : t("billing.refresh")}
      </Button>
    </div>
  );
}
