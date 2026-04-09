"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, Badge, UserAvatar } from "@/components/ui";
import { Unlink, Check, Camera } from "lucide-react";

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
}

const planBadgeVariant: Record<string, "default" | "success" | "warning"> = {
  FREE: "default",
  PRO: "success",
  TEAM: "warning",
};

export function SettingsContent({ user }: SettingsContentProps) {
  const { update } = useSession();
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
        if (!ctx) { reject(new Error("Canvas not supported")); return; }

        // Center-crop to square
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, 128, 128);

        resolve(canvas.toDataURL("image/webp", 0.85));
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";

    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be under 2MB");
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
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Manage your account and linked services
      </p>

      {/* Account info */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Account</h2>
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <UserAvatar name={user.name ?? "?"} image={avatarImage} size="lg" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--surface-1)] bg-[var(--accent)] text-white transition-colors hover:bg-[var(--accent-hover)]"
                title="Change avatar"
              >
                <Camera className="h-3 w-3" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-[var(--text-primary)]">
                  {user.name ?? "No name set"}
                </p>
                <Badge variant={planBadgeVariant[user.plan] ?? "default"}>
                  {user.plan}
                </Badge>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                {user.email ?? "No email"}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="text-xs text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
                >
                  {uploadingAvatar ? "Uploading..." : "Change avatar"}
                </button>
                {avatarImage && (
                  <>
                    <span className="text-[var(--text-disabled)]">·</span>
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      disabled={uploadingAvatar}
                      className="text-xs text-[var(--error)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Display name edit */}
          <div className="mt-5 border-t border-[var(--border)] pt-5">
            <label className="text-xs font-medium uppercase text-[var(--text-tertiary)]">
              Display Name
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                className="h-10 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-disabled)] focus:border-[var(--accent)]"
                placeholder="Enter display name"
              />
              <Button
                size="sm"
                disabled={!nameChanged || saving}
                onClick={handleSaveName}
              >
                {saved ? (
                  <><Check className="mr-1 h-3.5 w-3.5" /> Saved</>
                ) : saving ? (
                  "Saving..."
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Linked Accounts */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Linked Accounts</h2>

        {linked === "steam" && (
          <p className="mt-3 rounded-lg bg-[var(--success-muted)] px-3 py-2 text-sm text-[var(--success)]">
            Steam account linked successfully!
          </p>
        )}

        {error === "steam-already-linked" && (
          <p className="mt-3 rounded-lg bg-[var(--error-muted)] px-3 py-2 text-sm text-[var(--error)]">
            This Steam account is already linked to another user.
          </p>
        )}

        {linked === "faceit" && (
          <p className="mt-3 rounded-lg bg-[var(--success-muted)] px-3 py-2 text-sm text-[var(--success)]">
            FACEIT account linked successfully!
          </p>
        )}

        {error === "faceit-already-linked" && (
          <p className="mt-3 rounded-lg bg-[var(--error-muted)] px-3 py-2 text-sm text-[var(--error)]">
            This FACEIT account is already linked to another user.
          </p>
        )}

        {(error === "faceit-link-failed" || error === "faceit-denied") && (
          <p className="mt-3 rounded-lg bg-[var(--error-muted)] px-3 py-2 text-sm text-[var(--error)]">
            FACEIT linking failed. Please try again.
          </p>
        )}

        {/* Steam */}
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-3)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--text-secondary)]">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15h-2v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/>
                </svg>
              </div>
              <div>
                <p className="font-medium text-[var(--text-primary)]">Steam</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {hasSteam ? `Linked (ID: ${user.steamId})` : "Not linked"}
                </p>
              </div>
            </div>

            {hasSteam ? (
              <span className="rounded-full bg-[var(--success-muted)] px-3 py-1 text-xs font-medium text-[var(--success)]">
                Connected
              </span>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { window.location.href = "/api/auth/link-steam"; }}
              >
                Link Account
              </Button>
            )}
          </div>
        </div>

        {/* FACEIT */}
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-3)]">
                <span className="text-sm font-bold" style={{ color: "#ff5500" }}>F</span>
              </div>
              <div>
                <p className="font-medium text-[var(--text-primary)]">FACEIT</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {hasFaceit
                    ? `Linked as ${faceitState.nickname ?? faceitState.id}`
                    : "Not linked"}
                </p>
              </div>
            </div>

            {hasFaceit ? (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[var(--success-muted)] px-3 py-1 text-xs font-medium text-[var(--success)]">
                  Connected
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowUnlinkConfirm(true)}
                >
                  <Unlink className="mr-1 h-3.5 w-3.5" />
                  Unlink
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={openFaceitLinkPopup}
              >
                Link Account
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Unlink FACEIT confirmation modal */}
      {showUnlinkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              Unlink FACEIT Account
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Are you sure you want to unlink your FACEIT account? Previously synced matches will remain, but automatic sync will stop.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowUnlinkConfirm(false)}
                disabled={unlinking}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleUnlinkFaceit}
                disabled={unlinking}
                className="!border-[var(--error)] !text-[var(--error)] hover:!bg-[rgba(239,68,68,0.1)]"
              >
                {unlinking ? "Unlinking..." : "Unlink"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
