"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { BOARD_NAME_MAX } from "@/lib/team/board";
import { cn } from "@/lib/utils/cn";

const selectClass =
  "h-10 min-w-0 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none max-md:min-h-11";

export function BoardCreate({ teamId, maps }: { teamId: string; maps: Array<{ name: string; displayName: string }> }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [map, setMap] = useState(maps.find((m) => m.name === "de_mirage")?.name ?? maps[0]?.name ?? "de_mirage");
  const [side, setSide] = useState<"" | "CT" | "T">("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), map, side: side || null }),
      });
      if (res.status === 409) {
        toast({ title: t("teamBoard.limit"), variant: "error" });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const { id } = (await res.json()) as { id: string };
      router.push(`/team/${teamId}/boards/${id}`);
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_150px_auto] md:items-end">
        <label className="block space-y-1">
          <span className="text-sm text-[var(--text-secondary)]">{t("teamBoard.name")}</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={BOARD_NAME_MAX} placeholder={t("teamBoard.namePlaceholder")} required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-[var(--text-secondary)]">{t("teamBoard.map")}</span>
          <select value={map} onChange={(e) => setMap(e.target.value)} className={selectClass}>
            {maps.map((m) => (
              <option key={m.name} value={m.name}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-[var(--text-secondary)]">{t("teamBoard.side")}</span>
          <select value={side} onChange={(e) => setSide(e.target.value as "" | "CT" | "T")} className={cn(selectClass)}>
            <option value="">{t("teamBoard.sideAny")}</option>
            <option value="CT">CT</option>
            <option value="T">T</option>
          </select>
        </label>
        <Button type="submit" variant="cta" disabled={busy || !name.trim()}>
          <Plus className="h-4 w-4" aria-hidden />
          {t("teamBoard.create")}
        </Button>
      </form>
    </Card>
  );
}
