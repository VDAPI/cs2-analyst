"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Plus } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { TEAM_NAME_MAX, TEAM_TAG_MAX } from "@/lib/team/roster";

/** Pulls the code out of a pasted invite link, or takes the code itself. */
export function inviteCodeFrom(text: string): string {
  const v = text.trim();
  const m = v.match(/\/team\/join\/([A-Za-z0-9_-]{12})/);
  return m ? m[1] : v;
}

export function CreateTeamForm() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), tag: tag.trim() || undefined }),
      });
      if (res.status === 409) {
        toast({ title: t("team.limitTeams"), variant: "error" });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const { id } = (await res.json()) as { id: string };
      router.push(`/team/${id}/settings`);
      router.refresh();
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
        <label className="block space-y-1">
          <span className="text-sm text-[var(--text-secondary)]">{t("team.name")}</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={TEAM_NAME_MAX} required minLength={2} placeholder={t("team.namePlaceholder")} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-[var(--text-secondary)]">{t("team.tag")}</span>
          <Input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={TEAM_TAG_MAX} placeholder="C2A" />
        </label>
      </div>
      <Button type="submit" variant="cta" disabled={busy || name.trim().length < 2}>
        <Plus className="h-4 w-4" aria-hidden />
        {busy ? t("team.creating") : t("team.create")}
      </Button>
    </form>
  );
}

export function JoinTeamForm({ initialCode = "", compact = false }: { initialCode?: string; compact?: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = inviteCodeFrom(code);
    if (!value) return;
    setBusy(true);
    try {
      const res = await fetch("/api/teams/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      if (res.status === 404 || res.status === 400) {
        toast({ title: t("team.joinInvalid"), variant: "error" });
        return;
      }
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ title: body.error === "Team full" ? t("team.joinFull") : t("team.limitTeams"), variant: "error" });
        return;
      }
      if (res.status === 429) {
        toast({ title: t("team.joinTooMany"), variant: "error" });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const { id } = (await res.json()) as { id: string };
      router.push(`/team/${id}`);
      router.refresh();
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!compact && (
        <label className="block space-y-1">
          <span className="text-sm text-[var(--text-secondary)]">{t("team.joinCode")}</span>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("team.joinPlaceholder")} />
        </label>
      )}
      <Button type="submit" variant={compact ? "cta" : "primary"} disabled={busy || !code.trim()}>
        <LogIn className="h-4 w-4" aria-hidden />
        {busy ? t("team.joining") : t("team.join")}
      </Button>
    </form>
  );
}
