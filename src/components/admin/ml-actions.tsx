"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Play } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/** "Train now" and "Fill in match data" on /admin/ml. */
export function MlActions() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<"train" | "backfill" | null>(null);

  const run = async (action: "train" | "backfill") => {
    setBusy(action);
    try {
      const res = await fetch("/api/admin/ml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { status?: string; done?: number };
      toast({
        title:
          action === "train"
            ? t("winprob.admin.trainDone", { status: body.status ?? "" })
            : t("winprob.admin.backfillDone", { n: body.done ?? 0 }),
        variant: "success",
      });
      router.refresh();
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" onClick={() => run("train")} disabled={busy != null}>
        <Play className="h-4 w-4" aria-hidden />
        {busy === "train" ? t("winprob.admin.training") : t("winprob.admin.train")}
      </Button>
      <Button variant="secondary" onClick={() => run("backfill")} disabled={busy != null}>
        <Database className="h-4 w-4" aria-hidden />
        {t("winprob.admin.backfill")}
      </Button>
    </div>
  );
}
