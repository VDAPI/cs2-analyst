"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Save, Trash2 } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { MAX_RIVAL_PLAYERS, TEAM_NAME_MAX, parseSteamIdList } from "@/lib/team/roster";

const textareaClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-60";

/** The team's shared anti-strat sheet for a rival (any member edits it). */
export function RivalNotes({ teamId, rivalId, initial }: { teamId: string; rivalId: string; initial: string }) {
  const t = useT();
  const toast = useToast();
  const [notes, setNotes] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/rivals/${rivalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSaved(notes);
      toast({ title: t("common.saved"), variant: "success" });
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">{t("antistrat.notesTitle")}</h2>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">{t("antistrat.notesBody")}</p>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value.slice(0, 4000))}
        rows={6}
        placeholder={t("antistrat.notesPlaceholder")}
        aria-label={t("antistrat.notesTitle")}
        className={textareaClass}
      />
      <Button variant="primary" onClick={() => void save()} disabled={busy || notes === saved}>
        <Save className="h-4 w-4" aria-hidden />
        {busy ? t("common.saving") : notes === saved ? t("common.saved") : t("common.save")}
      </Button>
    </Card>
  );
}

/** Rename, change the rival's players, or delete it. */
export function RivalEdit({
  teamId,
  rivalId,
  name: initialName,
  steamIds,
  names,
  canEdit,
}: {
  teamId: string;
  rivalId: string;
  name: string;
  steamIds: string[];
  names: Record<string, string>;
  canEdit: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [ids, setIds] = useState(steamIds.join("\n"));
  const [busy, setBusy] = useState(false);

  async function save() {
    const { ids: list, invalid } = parseSteamIdList(ids);
    if (invalid.length || list.length === 0 || list.length > MAX_RIVAL_PLAYERS) {
      toast({ title: t("team.steamIdInvalidList", { ids: invalid.slice(0, 3).join(", ") || "—" }), variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/rivals/${rivalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), steamIds: list }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast({ title: t("common.saved"), variant: "success" });
      router.refresh();
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("rivals.deleteConfirm"))) return;
    const res = await fetch(`/api/teams/${teamId}/rivals/${rivalId}`, { method: "DELETE" });
    if (!res.ok) {
      toast({ title: t("common.error"), variant: "error" });
      return;
    }
    router.push(`/team/${teamId}/rivals`);
    router.refresh();
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">{t("rivals.playersTitle")}</h2>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">
          {steamIds.map((id) => names[id] ?? id).join(" · ")}
        </p>
      </div>
      {canEdit ? (
        <>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={TEAM_NAME_MAX} aria-label={t("rivals.name")} />
          <textarea value={ids} onChange={(e) => setIds(e.target.value)} rows={5} aria-label={t("rivals.steamIds", { n: MAX_RIVAL_PLAYERS })} className={`${textareaClass} font-mono`} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void save()} disabled={busy || name.trim().length < 1}>
              <Save className="h-4 w-4" aria-hidden />
              {t("common.save")}
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("rivals.delete")}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-[var(--text-tertiary)]">{t("rivals.editHint")}</p>
      )}
    </Card>
  );
}

/** "Na tablicę": a new board with the rival's typical positions on this map. */
export function BoardFromRival({
  teamId,
  rivalId,
  map,
  side,
  name,
  disabled,
}: {
  teamId: string;
  rivalId: string;
  map: string;
  side: "CT" | "T";
  name: string;
  disabled?: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.slice(0, 60), map, fromRival: { rivalId, side } }),
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
    <Button variant="secondary" size="sm" onClick={() => void create()} disabled={busy || disabled} title={t("antistrat.toBoardHint")}>
      <LayoutDashboard className="h-4 w-4" aria-hidden />
      {side === "CT" ? t("antistrat.toBoardCt") : t("antistrat.toBoardT")}
    </Button>
  );
}
