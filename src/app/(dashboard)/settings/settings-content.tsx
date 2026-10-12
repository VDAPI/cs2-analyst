"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PageHeader,
  UserAvatar,
  buttonVariants,
  useToast,
} from "@/components/ui";
import { AlertCircle, Camera, Check, CheckCircle, Link2, Unlink } from "lucide-react";

interface SettingsContentProps {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
    plan: string;
    steamId: string | null;
    faceitId: string | null;
    faceitNickname: string | null;
  };
  /** Plan usage this month; null limits mean unlimited. */
  usage: {
    used: number;
    monthlyLimit: number | null;
    keptDemos: number;
    keptLimit: number | null;
    batchSize: number;
    uploadFiles: number;
  };
}

const planBadgeVariant: Record<string, "default" | "success" | "warning"> = {
  FREE: "default",
  PRO: "success",
  TEAM: "warning",
};

const PLAN_LABEL: Record<string, string> = {
  FREE: "Darmowy",
  PRO: "Pro",
  TEAM: "Drużyna",
};

const fmtLimit = (n: number | null) => (n === null ? "∞" : String(n));

function Notice({ tone, children }: { tone: "good" | "mistake"; children: React.ReactNode }) {
  const Icon = tone === "good" ? CheckCircle : AlertCircle;
  return (
    <p
      role={tone === "mistake" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
        tone === "good"
          ? "bg-[var(--good-muted)] text-[var(--good)]"
          : "bg-[var(--mistake-muted)] text-[var(--mistake)]"
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function SettingsContent({ user, usage }: SettingsContentProps) {
  const { update } = useSession();
  const toast = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const linked = searchParams.get("linked");
  const error = searchParams.get("error");
  const didRefresh = useRef(false);

  // Profile editing state
  const [displayName, setDisplayName] = useState(user.name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [faceitState, setFaceitState] = useState({
    id: user.faceitId,
    nickname: user.faceitNickname,
  });

  useEffect(() => {
    if ((linked === "steam" || linked === "faceit") && !didRefresh.current) {
      didRefresh.current = true;
      update();
    }
  }, [linked, update]);

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "faceit-linked") {
        await update();
        router.replace("/settings?linked=faceit");
        router.refresh();
      }
    },
    [update, router]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  async function handleUnlinkFaceit() {
    setUnlinking(true);
    try {
      const res = await fetch("/api/faceit/unlink", { method: "POST" });
      if (res.ok) {
        setFaceitState({ id: null, nickname: null });
        await update();
        setShowUnlinkConfirm(false);
        router.refresh();
      }
    } finally {
      setUnlinking(false);
    }
  }

  async function handleSaveName() {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === user.name) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        await update();
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  // Avatar state
  const [avatarImage, setAvatarImage] = useState<string | null>(user.image);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resizeImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas nie jest obsługiwany")); return; }

        // Center-crop to square
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, 128, 128);

        resolve(canvas.toDataURL("image/webp", 0.85));
      };
      img.onerror = () => reject(new Error("Nie udało się wczytać obrazu"));
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Obraz musi mieć mniej niż 2 MB", variant: "warning" });
      return;
    }

    setUploadingAvatar(true);
    try {
      const dataUri = await resizeImage(file);
      const res = await fetch("/api/user/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUri }),
      });
      if (res.ok) {
        setAvatarImage(dataUri);
        await update();
        router.refresh();
      }
    } catch {
      // silently fail
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    setUploadingAvatar(true);
    try {
      const res = await fetch("/api/user/avatar", { method: "DELETE" });
      if (res.ok) {
        setAvatarImage(null);
        await update();
        router.refresh();
      }
    } finally {
      setUploadingAvatar(false);
    }
  }

  const hasSteam = !!user.steamId;
  const hasFaceit = !!faceitState.id;
  const nameChanged = displayName.trim() !== (user.name ?? "") && displayName.trim().length > 0;

  function openFaceitLinkPopup() {
    const w = 500;
    const h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    window.open(
      "/api/faceit/link",
      "faceit-link",
      `width=${w},height=${h},left=${left},top=${top},popup=yes`
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Konto"
        title="Ustawienia"
        description="Zarządzaj profilem, połączonymi kontami i planem."
      />

      {/* Profile */}
      <Card>
        <CardHeader title="Profil" description="Tak widzą Cię inni w raportach i porównaniach." />
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative shrink-0">
            <UserAvatar name={user.name ?? "?"} image={avatarImage} size="lg" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--surface-1)] bg-[var(--accent)] text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)]"
              title="Zmień awatar"
              aria-label="Zmień awatar"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="truncate font-medium text-[var(--text-primary)]">
                {user.name ?? "Brak nazwy"}
              </p>
              <Badge variant={planBadgeVariant[user.plan] ?? "default"}>{user.plan}</Badge>
            </div>
            <p className="truncate text-sm text-[var(--text-secondary)]">
              {user.email ?? "Brak e-maila"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="text-sm text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)] max-md:min-h-11 md:text-xs"
              >
                {uploadingAvatar ? "Wysyłanie…" : "Zmień awatar"}
              </button>
              {avatarImage && (
                <>
                  <span className="text-[var(--text-disabled)]" aria-hidden>
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                    className="text-sm text-[var(--mistake)] transition-colors hover:text-[var(--text-primary)] max-md:min-h-11 md:text-xs"
                  >
                    Usuń
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Display name edit */}
        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <label htmlFor="display-name" className="label-overline text-[var(--text-tertiary)]">
            Nazwa wyświetlana
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              className="min-w-0 flex-1"
              placeholder="Wpisz nazwę"
            />
            <Button
              disabled={!nameChanged || saving}
              onClick={handleSaveName}
              className="sm:w-auto"
            >
              {saved ? (
                <>
                  <Check className="h-4 w-4" aria-hidden /> Zapisano
                </>
              ) : saving ? (
                "Zapisywanie…"
              ) : (
                "Zapisz"
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Linked Accounts */}
      <Card>
        <CardHeader
          title="Połączone konta"
          description="Steam rozpoznaje Cię w demach, FACEIT pobiera historię meczów."
        />

        <div className="space-y-2">
          {linked === "steam" && <Notice tone="good">Konto Steam zostało połączone.</Notice>}
          {error === "steam-already-linked" && (
            <Notice tone="mistake">To konto Steam jest już połączone z innym użytkownikiem.</Notice>
          )}
          {linked === "faceit" && <Notice tone="good">Konto FACEIT zostało połączone.</Notice>}
          {error === "faceit-already-linked" && (
            <Notice tone="mistake">To konto FACEIT jest już połączone z innym użytkownikiem.</Notice>
          )}
          {(error === "faceit-link-failed" || error === "faceit-denied") && (
            <Notice tone="mistake">Nie udało się połączyć FACEIT. Spróbuj ponownie.</Notice>
          )}
        </div>

        <ul className="mt-2 divide-y divide-[var(--divider)]">
          {/* Steam */}
          <li className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-3)]">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-[var(--text-secondary)]"
                  aria-hidden
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15h-2v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[var(--text-primary)]">Steam</p>
                  {hasSteam ? (
                    <Badge variant="success">Połączone</Badge>
                  ) : (
                    <Badge variant="neutral">Niepołączone</Badge>
                  )}
                </div>
                <p className="truncate text-sm text-[var(--text-secondary)]">
                  {hasSteam ? (
                    <>
                      ID: <span className="font-mono tabular-nums">{user.steamId}</span>
                    </>
                  ) : (
                    "Połącz, by rozpoznawać Twoje mecze"
                  )}
                </p>
              </div>
            </div>

            {!hasSteam && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  window.location.href = "/api/auth/link-steam";
                }}
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                Połącz
              </Button>
            )}
          </li>

          {/* FACEIT */}
          <li className="flex flex-wrap items-center justify-between gap-3 py-4 last:pb-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--faceit-muted)]">
                <span className="font-display text-sm font-bold text-[var(--faceit)]" aria-hidden>
                  F
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[var(--text-primary)]">FACEIT</p>
                  {hasFaceit ? (
                    <Badge variant="success">Połączone</Badge>
                  ) : (
                    <Badge variant="neutral">Niepołączone</Badge>
                  )}
                </div>
                <p className="truncate text-sm text-[var(--text-secondary)]">
                  {hasFaceit
                    ? `Połączono jako ${faceitState.nickname ?? faceitState.id}`
                    : "Połącz, by wybierać mecze z historii FACEIT"}
                </p>
              </div>
            </div>

            {hasFaceit ? (
              <Button variant="secondary" size="sm" onClick={() => setShowUnlinkConfirm(true)}>
                <Unlink className="h-3.5 w-3.5" aria-hidden />
                Odłącz
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={openFaceitLinkPopup}>
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                Połącz
              </Button>
            )}
          </li>
        </ul>
      </Card>

      {/* Plan & limits */}
      <Card>
        <CardHeader
          title="Plan i limity"
          description="Darmowy plan ma miesięczny limit analiz. Płatne plany pojawią się później."
          action={<Badge variant={planBadgeVariant[user.plan] ?? "default"}>{PLAN_LABEL[user.plan] ?? user.plan}</Badge>}
        />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Analizy w tym miesiącu", value: `${usage.used}/${fmtLimit(usage.monthlyLimit)}` },
            { label: "Zachowane dema", value: `${usage.keptDemos}/${fmtLimit(usage.keptLimit)}` },
            { label: "Mecze naraz (FACEIT)", value: String(usage.batchSize) },
            { label: "Pliki naraz (upload)", value: String(usage.uploadFiles) },
          ].map((row) => (
            <div
              key={row.label}
              className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
            >
              <dt className="label-overline text-[var(--text-tertiary)]" title={row.label}>
                {row.label}
              </dt>
              <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/library" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Biblioteka analiz
          </Link>
          <Link href="/queue" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Kolejka analiz
          </Link>
        </div>
      </Card>

      {/* Unlink FACEIT confirmation modal */}
      {showUnlinkConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unlink-faceit-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5 shadow-[var(--shadow-lg)] sm:p-6">
            <h3
              id="unlink-faceit-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              Odłączyć konto FACEIT?
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Zsynchronizowane mecze zostaną, ale automatyczna synchronizacja się zatrzyma.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowUnlinkConfirm(false)}
                disabled={unlinking}
              >
                Anuluj
              </Button>
              <Button variant="danger" size="sm" onClick={handleUnlinkFaceit} disabled={unlinking}>
                {unlinking ? "Odłączanie…" : "Odłącz"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
