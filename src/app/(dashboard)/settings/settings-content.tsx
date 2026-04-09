"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import Image from "next/image";
import { Unlink } from "lucide-react";

interface SettingsContentProps {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
    steamId: string | null;
    faceitId: string | null;
    faceitNickname: string | null;
  };
}

export function SettingsContent({ user }: SettingsContentProps) {
  const { update } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const linked = searchParams.get("linked");
  const error = searchParams.get("error");
  const didRefresh = useRef(false);

  const [faceitState, setFaceitState] = useState({
    id: user.faceitId,
    nickname: user.faceitNickname,
  });

  // Refresh session JWT after linking so other pages also see the change
  useEffect(() => {
    if ((linked === "steam" || linked === "faceit") && !didRefresh.current) {
      didRefresh.current = true;
      update();
    }
  }, [linked, update]);

  // Listen for popup message (FACEIT linking in popup window)
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

  const hasSteam = !!user.steamId;
  const hasFaceit = !!faceitState.id;

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
            {user.image ? (
              <Image
                src={user.image}
                alt="Avatar"
                width={48}
                height={48}
                className="rounded-full"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-[var(--surface-3)]" />
            )}
            <div>
              <p className="font-medium text-[var(--text-primary)]">
                {user.name ?? "No name set"}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                {user.email ?? "No email"}
              </p>
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
                  {hasSteam
                    ? `Linked (ID: ${user.steamId})`
                    : "Not linked"}
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
                onClick={() => {
                  window.location.href = "/api/auth/link-steam";
                }}
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
