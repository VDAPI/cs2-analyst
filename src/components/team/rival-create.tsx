"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { MAX_RIVAL_PLAYERS, TEAM_NAME_MAX, parseSteamIdList } from "@/lib/team/roster";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";

type Source = "team" | "library" | "manual";

export function RivalCreate({
  teamId,
  teamMatches,
  libraryMatches,
}: {
  teamId: string;
  teamMatches: Array<{ matchId: string; map: string; date: string; side: "CT" | "T"; names: string[] }>;
  libraryMatches: Array<{ matchId: string; map: string; date: string; ct: string[]; t: string[] }>;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [source, setSource] = useState<Source>(teamMatches.length > 0 ? "team" : libraryMatches.length > 0 ? "library" : "manual");
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [ids, setIds] = useState("");

  async function create(key: string, body: Record<string, unknown>) {
    setBusy(key);
    try {
      const res = await fetch(`/api/teams/${teamId}/rivals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...(name.trim() ? { name: name.trim() } : {}) }),
      });
      if (res.status === 409) {
        toast({ title: t("rivals.limit"), variant: "error" });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const { id } = (await res.json()) as { id: string };
      router.push(`/team/${teamId}/rivals/${id}`);
      router.refresh();
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  function createManual() {
    const { ids: list, invalid } = parseSteamIdList(ids);
    if (invalid.length || list.length === 0) {
      toast({ title: t("team.steamIdInvalidList", { ids: invalid.slice(0, 3).join(", ") || "—" }), variant: "error" });
      return;
    }
    if (!name.trim()) {
      toast({ title: t("rivals.nameRequired"), variant: "error" });
      return;
    }
    void create("manual", { steamIds: list.slice(0, MAX_RIVAL_PLAYERS) });
  }

  const tabs: Array<{ key: Source; label: string }> = [
    { key: "team", label: t("rivals.fromTeam") },
    { key: "library", label: t("rivals.fromLibrary") },
    { key: "manual", label: t("rivals.fromManual") },
  ];
  const lineup = (names: string[]) => names.slice(0, 5).join(", ");

  return (
    <Card className="space-y-4">
      <div role="tablist" aria-label={t("rivals.addTitle")} className="flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={source === tab.key}
            onClick={() => setSource(tab.key)}
            className={cn(
              "min-h-9 flex-1 rounded-md px-3 text-sm font-medium transition-colors max-md:min-h-11",
              source === tab.key ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <label className="block space-y-1">
        <span className="text-sm text-[var(--text-secondary)]">{source === "manual" ? t("rivals.name") : t("rivals.nameOptional")}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={TEAM_NAME_MAX} placeholder={t("rivals.namePlaceholder")} />
      </label>

      {source === "team" &&
        (teamMatches.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">{t("rivals.noTeamMatches")}</p>
        ) : (
          <ul className="space-y-2">
            {teamMatches.map((m) => (
              <li key={m.matchId} className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {mapDisplayName(m.map)} <span className="font-mono text-xs text-[var(--text-tertiary)]">{formatDate(m.date)}</span>
                  </p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">{lineup(m.names)}</p>
                </div>
                <Button size="sm" variant="primary" disabled={busy != null} onClick={() => void create(m.matchId, { fromMatchId: m.matchId, side: m.side })}>
                  <Plus className="h-4 w-4" aria-hidden />
                  {t("rivals.scout")}
                </Button>
              </li>
            ))}
          </ul>
        ))}

      {source === "library" &&
        (libraryMatches.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">{t("rivals.noLibrary")}</p>
        ) : (
          <>
            <p className="text-xs text-[var(--text-tertiary)]">{t("rivals.libraryHint")}</p>
            <ul className="space-y-2">
              {libraryMatches.map((m) => (
                <li key={m.matchId} className="space-y-2 rounded-lg border border-[var(--border)] p-2.5">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {mapDisplayName(m.map)} <span className="font-mono text-xs text-[var(--text-tertiary)]">{formatDate(m.date)}</span>
                  </p>
                  {(["CT", "T"] as const).map((side) => (
                    <div key={side} className="flex min-w-0 items-center gap-2">
                      <span className={cn("w-7 shrink-0 font-mono text-xs font-semibold", side === "CT" ? "text-[var(--ct-blue)]" : "text-[var(--t-gold)]")}>{side}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">{lineup(side === "CT" ? m.ct : m.t)}</span>
                      <Button size="sm" variant="secondary" disabled={busy != null} onClick={() => void create(`${m.matchId}:${side}`, { fromMatchId: m.matchId, side })}>
                        {t("rivals.scoutShort")}
                      </Button>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </>
        ))}

      {source === "manual" && (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm text-[var(--text-secondary)]">{t("rivals.steamIds", { n: MAX_RIVAL_PLAYERS })}</span>
            <textarea
              value={ids}
              onChange={(e) => setIds(e.target.value)}
              rows={5}
              placeholder={"76561198000000011\n76561198000000012"}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:border-[var(--accent)] focus:outline-none"
            />
          </label>
          <Button variant="primary" disabled={busy != null} onClick={createManual}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("rivals.add")}
          </Button>
        </div>
      )}
    </Card>
  );
}
