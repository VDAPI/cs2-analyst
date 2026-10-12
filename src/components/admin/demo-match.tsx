"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

async function save(matchId: string | null): Promise<boolean> {
  const res = await fetch("/api/admin/demo-match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matchId }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

function useSave() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (matchId: string | null) => {
    setBusy(true);
    const ok = await save(matchId);
    setBusy(false);
    toast(ok ? { title: t("onboarding.admin.saved"), variant: "success" } : { title: t("onboarding.admin.invalid"), variant: "error" });
    if (ok) router.refresh();
    return ok;
  };
  return { busy, run };
}

/** Pick any analysed match by id (the owner's own, with the players' consent), or go back to automatic. */
export function DemoMatchForm({ picked }: { picked: boolean }) {
  const t = useT();
  const { busy, run } = useSave();
  const [id, setId] = useState("");
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (id.trim() && (await run(id.trim()))) setId("");
      }}
    >
      <label className="grid min-w-0 flex-1 gap-1 text-sm text-[var(--text-secondary)]">
        {t("onboarding.admin.matchIdLabel")}
        <Input value={id} onChange={(e) => setId(e.target.value)} className="font-mono" spellCheck={false} />
      </label>
      <Button type="submit" variant="primary" disabled={busy || !id.trim()}>
        {t("onboarding.admin.matchIdSet")}
      </Button>
      {picked && (
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void run(null)}>
          {t("onboarding.admin.reset")}
        </Button>
      )}
    </form>
  );
}

/** "Ustaw jako przykład" on a row of the pro pool table. */
export function SetDemoMatchButton({ matchId }: { matchId: string }) {
  const t = useT();
  const { busy, run } = useSave();
  return (
    <Button variant="ghost" size="sm" onClick={() => void run(matchId)} disabled={busy} aria-label={t("onboarding.admin.set")}>
      <Star className="h-3.5 w-3.5" aria-hidden />
      <span className="max-sm:sr-only">{t("onboarding.admin.set")}</span>
    </Button>
  );
}
