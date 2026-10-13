"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, RefreshCw, UserPlus, X } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { shareOrCopy } from "@/components/share/share-button";

async function call(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
}

/** Invite link: created on the first tap, copied (or handed to the share sheet), resettable. */
export function FriendInviteCard({ initialPath }: { initialPath: string | null }) {
  const t = useT();
  const toast = useToast();
  const [path, setPath] = useState(initialPath);
  const [busy, setBusy] = useState(false);
  // The origin is only known in the browser; set after mount so the server render matches.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = path ? `${origin}${path}` : null;

  async function make(reset: boolean) {
    setBusy(true);
    try {
      const res = await call("/api/friends/code", { method: "POST", body: JSON.stringify({ reset }) });
      if (!res.ok) throw new Error(String(res.status));
      const { path: p } = (await res.json()) as { path: string };
      setPath(p);
      const full = new URL(p, window.location.origin).toString();
      if (!reset) {
        const ok = await shareOrCopy(full, t("friends.inviteSheet"));
        toast(ok ? { title: t("friends.inviteCopied"), variant: "success" } : { title: full, variant: "info", duration: 15000 });
      } else {
        toast({ title: t("friends.inviteReset"), variant: "success" });
      }
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    const ok = await shareOrCopy(url, t("friends.inviteSheet"));
    toast(ok ? { title: t("friends.inviteCopied"), variant: "success" } : { title: url, variant: "info", duration: 15000 });
  }

  return (
    <div className="space-y-3">
      {path ? (
        <>
          <label className="block space-y-1">
            <span className="text-sm text-[var(--text-secondary)]">{t("friends.inviteLink")}</span>
            <Input readOnly value={url ?? ""} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" size="sm" onClick={copy}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              {t("friends.inviteCopy")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => make(true)} disabled={busy}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {t("friends.inviteNew")}
            </Button>
          </div>
        </>
      ) : (
        <Button type="button" variant="primary" onClick={() => make(false)} disabled={busy}>
          <Link2 className="h-4 w-4" aria-hidden />
          {t("friends.inviteCreate")}
        </Button>
      )}
      <p className="text-xs text-[var(--text-tertiary)]">{t("friends.inviteHint")}</p>
    </div>
  );
}

/** One action button on a person row (accept, decline, remove, add). */
export function FriendAction({
  kind,
  id,
  userId,
  name,
}: {
  kind: "accept" | "decline" | "cancel" | "remove" | "request";
  /** Friendship row id (all but "request"). */
  id?: string;
  /** Suggested user ("request"). */
  userId?: string;
  name: string;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (kind === "remove" && !window.confirm(t("friends.removeConfirm", { name }))) return;
    setBusy(true);
    try {
      const res =
        kind === "request"
          ? await call("/api/friends", { method: "POST", body: JSON.stringify({ userId }) })
          : kind === "accept"
            ? await call(`/api/friends/${id}`, { method: "PATCH", body: JSON.stringify({ action: "accept" }) })
            : await call(`/api/friends/${id}`, { method: "DELETE" });
      if (res.status === 409) {
        toast({ title: t("friends.limit"), variant: "error" });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      if (kind === "request") toast({ title: t("friends.requestSent", { name }), variant: "success" });
      if (kind === "accept") toast({ title: t("friends.accepted", { name }), variant: "success" });
      router.refresh();
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const label = {
    accept: t("friends.accept"),
    decline: t("friends.decline"),
    cancel: t("friends.cancelRequest"),
    remove: t("friends.remove"),
    request: t("friends.add"),
  }[kind];
  const Icon = kind === "accept" ? Check : kind === "request" ? UserPlus : X;
  return (
    <Button
      type="button"
      size="sm"
      variant={kind === "accept" || kind === "request" ? "primary" : "ghost"}
      onClick={run}
      disabled={busy}
      aria-label={`${label}: ${name}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Button>
  );
}

/** "Add friend" on an invite link page. */
export function AcceptInviteButton({ code, name }: { code: string; name: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await call("/api/friends/add", { method: "POST", body: JSON.stringify({ code }) });
      if (res.status === 409) {
        toast({ title: t("friends.limit"), variant: "error" });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      toast({ title: t("friends.accepted", { name }), variant: "success" });
      router.push("/friends");
      router.refresh();
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="cta" onClick={run} disabled={busy}>
      <UserPlus className="h-4 w-4" aria-hidden />
      {t("friends.addFromInvite")}
    </Button>
  );
}
