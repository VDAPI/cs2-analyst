"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Link2Off } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input, buttonVariants, useToast } from "@/components/ui";
import { shareOrCopy } from "@/components/share/share-button";
import { isValidSlug, normalizeSlug, profilePath, sharePath } from "@/lib/sharing/share";
import { useT } from "@/lib/i18n/client";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";

/** Settings → public profile at /u/<slug> (S16). */
export function PublicProfileCard({ enabled, slug: initialSlug }: { enabled: boolean; slug: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [slug, setSlug] = useState(initialSlug);
  const [saved, setSaved] = useState(initialSlug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(nextOn: boolean) {
    const s = normalizeSlug(slug);
    if (!isValidSlug(s)) {
      setError(t("publicProfile.invalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/user/public-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextOn, slug: s }),
      });
      if (res.status === 409) setError(t("publicProfile.taken"));
      else if (!res.ok) setError(t("publicProfile.invalid"));
      else {
        setOn(nextOn);
        setSlug(s);
        setSaved(s);
        toast({ title: t("publicProfile.saved"), variant: "success" });
        router.refresh();
      }
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const url = new URL(profilePath(saved), window.location.origin).toString();
    const ok = await shareOrCopy(url, t("publicProfile.title"));
    toast(ok ? { title: t("share.copied"), variant: "success" } : { title: t("share.copyFailed", { url }), variant: "info", duration: 15000 });
  }

  return (
    <Card id="profil-publiczny" className="scroll-mt-20">
      <CardHeader
        title={t("publicProfile.title")}
        description={t("publicProfile.description")}
        action={<Badge variant={on ? "success" : "default"}>{t(on ? "publicProfile.on" : "publicProfile.off")}</Badge>}
      />
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save(on);
        }}
      >
        <label className="block space-y-1 text-sm text-[var(--text-secondary)]">
          <span>{t("publicProfile.address")}</span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-mono text-sm text-[var(--text-tertiary)]">/u/</span>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              onBlur={() => slug !== saved && on && save(on)}
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              aria-invalid={error ? true : undefined}
            />
          </div>
        </label>
        {error ? (
          <p role="alert" className="text-xs text-[var(--mistake)]">
            {error}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)]">{t("publicProfile.addressHint")}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={on ? "secondary" : "primary"} size="sm" disabled={busy} onClick={() => save(!on)}>
            {t(on ? "publicProfile.disable" : "publicProfile.enable")}
          </Button>
          {on && (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={copy}>
                <Copy className="h-3.5 w-3.5" aria-hidden />
                {t("publicProfile.copy")}
              </Button>
              <Link href={profilePath(saved)} target="_blank" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                {t("publicProfile.open")}
              </Link>
            </>
          )}
        </div>
      </form>
    </Card>
  );
}

export interface ShareRow {
  id: string;
  token: string;
  kind: string;
  map: string;
  round: number | null;
  views: number;
  createdAt: string;
}

/** Settings → every live public link, with copy and turn off (S16). */
export function SharesCard({ shares: initial }: { shares: ShareRow[] }) {
  const t = useT();
  const toast = useToast();
  const [shares, setShares] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function revoke(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/shares/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setShares((s) => s.filter((x) => x.id !== id));
      toast({ title: t("shares.revoked"), variant: "success" });
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function copy(token: string) {
    const url = new URL(sharePath(token), window.location.origin).toString();
    const ok = await shareOrCopy(url, t("share.shareSheetTitle"));
    toast(ok ? { title: t("share.copied"), variant: "success" } : { title: t("share.copyFailed", { url }), variant: "info", duration: 15000 });
  }

  return (
    <Card>
      <CardHeader title={t("shares.title")} description={t("shares.description")} />
      {shares.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">{t("shares.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {shares.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
            >
              <div className="min-w-0 flex-1">
                <Link href={sharePath(s.token)} target="_blank" className="block truncate text-sm font-medium text-[var(--text-primary)] hover:underline">
                  {s.kind === "moment"
                    ? t("shares.moment", { map: mapDisplayName(s.map), round: s.round ?? 1 })
                    : t("shares.report", { map: mapDisplayName(s.map) })}
                </Link>
                <p className="text-xs text-[var(--text-tertiary)]">
                  <span className="font-mono">{t("shares.views", { n: s.views })}</span> ·{" "}
                  {t("shares.created", { date: formatDate(s.createdAt) })}
                </p>
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => copy(s.token)}>
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {t("shares.copy")}
                </Button>
                <Button type="button" variant="danger" size="sm" disabled={busy === s.id} onClick={() => revoke(s.id)}>
                  <Link2Off className="h-3.5 w-3.5" aria-hidden />
                  {t("shares.revoke")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
