"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LogOut, RefreshCw, Save, Trash2, UserMinus } from "lucide-react";
import { Badge, Button, Card, Input, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { MAX_EXTRA_PLAYERS, TEAM_NAME_MAX, TEAM_TAG_MAX, isSteamId64, parseSteamIdList, type TeamRoleName } from "@/lib/team/roster";
import { ROLE_KEY } from "./labels";

interface MemberView {
  id: string;
  name: string | null;
  image: string | null;
  role: TeamRoleName;
  steamId: string | null;
  accountSteamId: string | null;
  inGameName: string | null;
}

const selectClass =
  "h-10 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none max-md:min-h-11";

export function TeamSettings({
  teamId,
  team,
  inviteCode,
  role,
  meId,
  canManage,
  canManageRoster,
  members,
  candidates,
  inGameName,
}: {
  teamId: string;
  team: { name: string; tag: string | null; extraSteamIds: string[] };
  inviteCode: string | null;
  role: TeamRoleName;
  meId: string;
  canManage: boolean;
  canManageRoster: boolean;
  members: MemberView[];
  candidates: Array<{ steamId: string; name: string; matches: number }>;
  inGameName: Record<string, string>;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const me = members.find((m) => m.id === meId)!;
  const [mySteam, setMySteam] = useState(me.steamId ?? "");
  const [name, setName] = useState(team.name);
  const [tag, setTag] = useState(team.tag ?? "");
  const [extra, setExtra] = useState(team.extraSteamIds.join("\n"));

  useEffect(() => setOrigin(window.location.origin), []);
  const inviteUrl = inviteCode ? `${origin}/team/join/${inviteCode}` : null;

  async function call(key: string, url: string, method: "PATCH" | "DELETE", body?: unknown): Promise<Response | null> {
    setBusy(key);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        toast({ title: res.status === 403 ? t("team.forbidden") : t("common.error"), variant: "error" });
        return null;
      }
      return res;
    } catch {
      toast({ title: t("common.error"), variant: "error" });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: t("team.copyFailed"), variant: "error" });
    }
  }

  async function saveMySteam() {
    const value = mySteam.trim();
    if (value && !isSteamId64(value)) {
      toast({ title: t("team.steamIdInvalid"), variant: "error" });
      return;
    }
    if (await call("me", `/api/teams/${teamId}/members/${meId}`, "PATCH", { steamId: value || null })) {
      toast({ title: t("common.saved"), variant: "success" });
      router.refresh();
    }
  }

  async function saveExtra() {
    const { ids, invalid } = parseSteamIdList(extra);
    if (invalid.length) {
      toast({ title: t("team.steamIdInvalidList", { ids: invalid.slice(0, 3).join(", ") }), variant: "error" });
      return;
    }
    if (ids.length > MAX_EXTRA_PLAYERS) {
      toast({ title: t("team.extraTooMany", { n: MAX_EXTRA_PLAYERS }), variant: "error" });
      return;
    }
    if (await call("extra", `/api/teams/${teamId}`, "PATCH", { extraSteamIds: ids })) {
      toast({ title: t("common.saved"), variant: "success" });
      router.refresh();
    }
  }

  async function saveTeam() {
    if (await call("team", `/api/teams/${teamId}`, "PATCH", { name: name.trim(), tag: tag.trim() || null })) {
      toast({ title: t("common.saved"), variant: "success" });
      router.refresh();
    }
  }

  async function regenerate() {
    if (!window.confirm(t("team.regenerateConfirm"))) return;
    if (await call("invite", `/api/teams/${teamId}`, "PATCH", { regenerateInvite: true })) router.refresh();
  }

  async function setRole(memberId: string, next: TeamRoleName) {
    if (next === "OWNER" && !window.confirm(t("team.transferConfirm"))) return;
    if (await call(`role:${memberId}`, `/api/teams/${teamId}/members/${memberId}`, "PATCH", { role: next })) router.refresh();
  }

  async function removeMember(memberId: string) {
    const self = memberId === meId;
    if (!window.confirm(self ? t("team.leaveConfirm") : t("team.removeConfirm"))) return;
    if (await call(`remove:${memberId}`, `/api/teams/${teamId}/members/${memberId}`, "DELETE")) {
      if (self) {
        router.push("/team?all=1");
        router.refresh();
      } else router.refresh();
    }
  }

  async function deleteTeam() {
    const typed = window.prompt(t("team.deleteConfirm", { name: team.name }));
    if (typed?.trim() !== team.name) return;
    if (await call("delete", `/api/teams/${teamId}`, "DELETE")) {
      router.push("/team?all=1");
      router.refresh();
    }
  }

  const steamOf = (m: MemberView) => m.steamId ?? m.accountSteamId;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {inviteUrl && (
        <Card className="space-y-3 lg:col-span-2">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">{t("team.inviteLinkTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">{t("team.inviteLinkBody")}</p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Input readOnly value={inviteUrl} aria-label={t("team.inviteLinkTitle")} className="min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="primary" onClick={() => void copyInvite()}>
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? t("team.copied") : t("team.copy")}
            </Button>
            {canManage && (
              <Button variant="secondary" onClick={() => void regenerate()} disabled={busy === "invite"}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                {t("team.regenerate")}
              </Button>
            )}
          </div>
        </Card>
      )}

      <Card className="space-y-3">
        <div>
          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">{t("team.meTitle")}</h2>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            {me.accountSteamId ? t("team.meSteamLinked", { id: me.accountSteamId }) : t("team.meBody")}
          </p>
        </div>
        {candidates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => (
              <button
                key={c.steamId}
                type="button"
                onClick={() => setMySteam(c.steamId)}
                aria-pressed={mySteam === c.steamId}
                className="flex min-h-10 max-w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] aria-pressed:border-[var(--border-active)] aria-pressed:bg-[var(--accent-muted)] aria-pressed:text-[var(--text-primary)]"
              >
                <span className="min-w-0 truncate">{c.name}</span>
                <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">{t("team.candidateMatches", { n: c.matches })}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex min-w-0 flex-wrap gap-2">
          <Input
            value={mySteam}
            onChange={(e) => setMySteam(e.target.value)}
            placeholder={me.accountSteamId ?? "7656119…"}
            aria-label={t("team.meSteamId")}
            className="min-w-0 flex-1 font-mono"
            inputMode="numeric"
          />
          <Button variant="primary" onClick={() => void saveMySteam()} disabled={busy === "me"}>
            <Save className="h-4 w-4" aria-hidden />
            {t("common.save")}
          </Button>
        </div>
        {mySteam && inGameName[mySteam] && <p className="text-xs text-[var(--text-tertiary)]">{t("team.inDemosAs", { name: inGameName[mySteam] })}</p>}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">{t("team.membersTitle", { n: members.length })}</h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {m.name ?? t("common.noName")}
                  {m.id === meId && <span className="ml-1 text-xs text-[var(--text-tertiary)]">({t("team.you")})</span>}
                </p>
                <p className="truncate font-mono text-xs text-[var(--text-tertiary)]">
                  {steamOf(m) ? `${m.inGameName ?? "?"} · ${steamOf(m)}` : t("team.noSteamId")}
                </p>
              </div>
              {canManage && m.id !== meId ? (
                <select
                  value={m.role}
                  onChange={(e) => void setRole(m.id, e.target.value as TeamRoleName)}
                  disabled={busy === `role:${m.id}`}
                  aria-label={t("team.roleLabel")}
                  className={selectClass}
                >
                  {(["PLAYER", "COACH", "OWNER"] as const).map((r) => (
                    <option key={r} value={r}>
                      {t(ROLE_KEY[r])}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge variant={m.role === "OWNER" ? "lime" : "neutral"}>{t(ROLE_KEY[m.role])}</Badge>
              )}
              {(m.id === meId || (canManage && m.id !== meId)) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void removeMember(m.id)}
                  disabled={busy === `remove:${m.id}`}
                  aria-label={m.id === meId ? t("team.leave") : t("team.remove")}
                  title={m.id === meId ? t("team.leave") : t("team.remove")}
                >
                  {m.id === meId ? <LogOut className="h-4 w-4" aria-hidden /> : <UserMinus className="h-4 w-4" aria-hidden />}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--text-tertiary)]">{t("team.rolesHint")}</p>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">{t("team.extraTitle")}</h2>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">{t("team.extraBody", { n: MAX_EXTRA_PLAYERS })}</p>
        </div>
        <textarea
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          rows={4}
          disabled={!canManageRoster}
          aria-label={t("team.extraTitle")}
          placeholder={"76561198000000002\n76561198000000003"}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
        />
        {team.extraSteamIds.length > 0 && (
          <p className="text-xs text-[var(--text-tertiary)]">
            {team.extraSteamIds.map((id) => inGameName[id] ?? id).join(" · ")}
          </p>
        )}
        {canManageRoster && (
          <Button variant="primary" onClick={() => void saveExtra()} disabled={busy === "extra"}>
            <Save className="h-4 w-4" aria-hidden />
            {t("common.save")}
          </Button>
        )}
      </Card>

      {canManage && (
        <Card className="space-y-3">
          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">{t("team.renameTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={TEAM_NAME_MAX} aria-label={t("team.name")} />
            <Input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={TEAM_TAG_MAX} aria-label={t("team.tag")} placeholder={t("team.tag")} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void saveTeam()} disabled={busy === "team" || name.trim().length < 2}>
              <Save className="h-4 w-4" aria-hidden />
              {t("common.save")}
            </Button>
            <Button variant="danger" onClick={() => void deleteTeam()} disabled={busy === "delete"}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("team.deleteTeam")}
            </Button>
          </div>
        </Card>
      )}

      {role !== "OWNER" && (
        <p className="text-xs text-[var(--text-tertiary)] lg:col-span-2">{t("team.notOwnerHint")}</p>
      )}
    </div>
  );
}
