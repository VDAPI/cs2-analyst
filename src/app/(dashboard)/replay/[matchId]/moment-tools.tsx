"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Link2, Loader2, MapPin, Plus, Trash2, X } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { createShareLink, shareOrCopy } from "@/components/share/share-button";
import { fmtRoundTime } from "@/lib/findings/view";
import { MAX_NOTE_LENGTH, momentReplayPath } from "@/lib/sharing/share";
import { useT } from "@/lib/i18n/client";
import { TICK_RATE } from "@/stores/replay-store";
import { cn } from "@/lib/utils/cn";

export interface MapNoteView {
  id: string;
  roundNumber: number;
  tick: number;
  x: number;
  y: number;
  text: string;
}

export type NoteMode = "off" | "placing" | "typing";

/** The uploader's map notes of a match (S16): loaded once, added and removed in place. */
export function useMapNotes(matchId: string) {
  const [notes, setNotes] = useState<MapNoteView[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/matches/${matchId}/notes`)
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      .then((d: { notes: MapNoteView[] }) => alive && setNotes(d.notes ?? []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [matchId]);

  const add = useCallback(
    async (note: { round: number; tick: number; x: number; y: number; text: string }) => {
      const res = await fetch(`/api/matches/${matchId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note),
      });
      if (!res.ok) throw new Error(`note ${res.status}`);
      const { note: saved } = (await res.json()) as { note: MapNoteView };
      setNotes((n) => [...n, saved].sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick));
    },
    [matchId]
  );

  const remove = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/matches/${matchId}/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`note ${res.status}`);
      setNotes((n) => n.filter((x) => x.id !== id));
    },
    [matchId]
  );

  return { notes, add, remove };
}

/**
 * Side panel of the replay: share the current moment (a private deep link or
 * a public link) and pin notes on the map for this round.
 */
export function MomentTools({
  matchId,
  round,
  tick,
  roundStartTick,
  selectedSteamId,
  notes,
  mode,
  pending,
  onModeChange,
  onSave,
  onRemove,
  onJump,
}: {
  matchId: string;
  round: number;
  tick: number;
  roundStartTick: number;
  selectedSteamId: string | null;
  /** Notes of this round, in pin order. */
  notes: MapNoteView[];
  mode: NoteMode;
  pending: { x: number; y: number } | null;
  onModeChange: (mode: NoteMode) => void;
  onSave: (text: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onJump: (note: MapNoteView) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const at = (k: number) => fmtRoundTime(Math.max(0, (k - roundStartTick) / TICK_RATE));

  async function copyPrivate() {
    const url = new URL(momentReplayPath(matchId, { round, tick, player: selectedSteamId }), window.location.origin).toString();
    const ok = await shareOrCopy(url, t("share.shareSheetTitle"));
    toast(ok ? { title: t("share.copied"), variant: "success" } : { title: t("share.copyFailed", { url }), variant: "info", duration: 15000 });
  }

  async function sharePublic() {
    setBusy("public");
    try {
      const url = await createShareLink({ kind: "moment", matchId, steamId: selectedSteamId, round, tick: Math.round(tick) });
      const ok = await shareOrCopy(url, t("share.shareSheetTitle"));
      toast(
        ok
          ? { title: t("share.copied"), description: t("share.momentHint"), variant: "success" }
          : { title: t("share.copyFailed", { url }), variant: "info", duration: 15000 }
      );
    } catch {
      toast({ title: t("share.failed"), variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const value = text.trim();
    if (!value) return;
    setBusy("save");
    try {
      await onSave(value);
      setText("");
      toast({ title: t("notes.saved"), variant: "success" });
    } catch {
      toast({ title: t("notes.failed"), variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 sm:col-span-2 lg:col-span-1">
      <div className="space-y-2">
        <p className="label-overline text-[var(--text-tertiary)]">
          {t("share.moment")} <span className="font-mono normal-case">R{round} · {at(tick)}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={copyPrivate}>
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            {t("share.momentPrivate")}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={sharePublic} disabled={busy === "public"}>
            {busy === "public" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Globe className="h-3.5 w-3.5" aria-hidden />}
            {t("share.momentPublic")}
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-t border-[var(--border)] pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="label-overline text-[var(--text-tertiary)]">{t("notes.title")}</p>
          {mode === "off" ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onModeChange("placing")}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {t("notes.add")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setText("");
                onModeChange("off");
              }}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {t("notes.cancel")}
            </Button>
          )}
        </div>

        {mode === "placing" && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-[var(--accent-2-muted)] px-2.5 py-2 text-xs text-[var(--accent-2)]">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("notes.placeHint")}
          </p>
        )}
        {mode === "typing" && pending && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <p role="status" className="text-xs text-[var(--text-tertiary)]">
              {t("notes.placed")} <span className="font-mono">R{round} · {at(tick)}</span>
            </p>
            <label className="sr-only" htmlFor="note-text">
              {t("notes.text")}
            </label>
            <textarea
              id="note-text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_NOTE_LENGTH))}
              placeholder={t("notes.placeholder")}
              rows={2}
              autoFocus
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 py-2 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)] focus:outline-none md:text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                {text.length}/{MAX_NOTE_LENGTH}
              </span>
              <Button type="submit" variant="primary" size="sm" disabled={busy === "save" || text.trim() === ""}>
                {t("notes.save")}
              </Button>
            </div>
          </form>
        )}

        {notes.length === 0 ? (
          mode === "off" && <p className="text-[13px] text-[var(--text-tertiary)]">{t("notes.empty")}</p>
        ) : (
          <ol className="max-h-[200px] space-y-1 overflow-y-auto">
            {notes.map((n, i) => {
              const near = Math.abs(tick - n.tick) <= 3 * TICK_RATE;
              return (
                <li key={n.id} className="flex items-start gap-1">
                  <button
                    type="button"
                    onClick={() => onJump(n)}
                    title={t("notes.jump")}
                    className={cn(
                      "flex min-h-10 min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                      near ? "bg-[var(--accent-2-muted)]" : "hover:bg-[var(--surface-2)]"
                    )}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-2)] font-mono text-[11px] font-bold text-[var(--on-accent)]">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-[var(--text-secondary)]">{n.text}</span>
                    <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">{at(n.tick)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setBusy(`del:${n.id}`);
                      try {
                        await onRemove(n.id);
                        toast({ title: t("notes.removed"), variant: "success" });
                      } catch {
                        toast({ title: t("common.error"), variant: "error" });
                      } finally {
                        setBusy(null);
                      }
                    }}
                    disabled={busy === `del:${n.id}`}
                    aria-label={t("notes.remove")}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--mistake)] disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
