"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import Image from "next/image";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { data: session, update } = useSession();
  const searchParams = useSearchParams();
  const linked = searchParams.get("linked");
  const error = searchParams.get("error");

  // Refresh session after linking
  if (linked === "steam") {
    update();
  }

  const hasSteam = !!session?.user?.steamId;

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
            {session?.user?.image ? (
              <Image
                src={session.user.image}
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
                {session?.user?.name ?? "No name set"}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                {session?.user?.email ?? "No email"}
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
                    ? `Linked (ID: ${session.user.steamId})`
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

        {/* Future: FACEIT */}
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 opacity-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-3)]">
                <span className="text-sm font-bold text-[var(--text-tertiary)]">F</span>
              </div>
              <div>
                <p className="font-medium text-[var(--text-primary)]">FACEIT</p>
                <p className="text-sm text-[var(--text-secondary)]">Coming soon</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" disabled>
              Link Account
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
