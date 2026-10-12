"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Download, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, Input, buttonVariants } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/** Settings → privacy and data (S29): data export and account deletion. */
export function PrivacyCard({ hasPassword }: { hasPassword: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const word = t("settings.deleteConfirmWord");
  const ready = confirm.trim().toUpperCase() === word && (!hasPassword || password.length > 0);

  function close() {
    if (deleting) return;
    setOpen(false);
    setConfirm("");
    setPassword("");
    setError("");
  }

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm, password: hasPassword ? password : undefined }),
      });
      if (!res.ok) {
        setError(
          res.status === 403
            ? t("settings.deleteWrongPassword")
            : res.status === 429
              ? t("settings.tooMany")
              : t("settings.deleteFailed")
        );
        setDeleting(false);
        return;
      }
      await signOut({ callbackUrl: "/" });
    } catch {
      setError(t("settings.deleteFailed"));
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t("settings.privacyTitle")} description={t("settings.privacyDescription")} />
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium text-[var(--text-primary)]">{t("settings.exportTitle")}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("settings.exportBody")}</p>
          </div>
          <a href="/api/user/export" download className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Download className="h-4 w-4" aria-hidden />
            {t("settings.exportButton")}
          </a>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-[var(--mistake-muted)] bg-[var(--surface-2)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium text-[var(--mistake)]">{t("settings.deleteTitle")}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("settings.deleteBody")}</p>
          </div>
          <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
            <Trash2 className="h-4 w-4" aria-hidden />
            {t("settings.deleteButton")}
          </Button>
        </div>

        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-tertiary)]">
          <span>{t("settings.legalLinks")}:</span>
          <Link href="/privacy" className="text-[var(--accent)] hover:text-[var(--accent-hover)]">
            {t("legal.privacy")}
          </Link>
          <Link href="/terms" className="text-[var(--accent)] hover:text-[var(--accent-hover)]">
            {t("legal.terms")}
          </Link>
        </p>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <form
            className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5 shadow-[var(--shadow-lg)] sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready && !deleting) void handleDelete();
            }}
          >
            <h3 id="delete-account-title" className="font-display text-lg font-semibold text-[var(--text-primary)]">
              {t("settings.deleteDialogTitle")}
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("settings.deleteDialogBody")}</p>
            <label htmlFor="delete-confirm" className="mt-4 block text-sm font-medium text-[var(--text-secondary)]">
              {t("settings.deleteConfirmLabel")}
            </label>
            <Input
              id="delete-confirm"
              className="mt-1.5"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              autoFocus
            />
            {hasPassword && (
              <>
                <label htmlFor="delete-password" className="mt-3 block text-sm font-medium text-[var(--text-secondary)]">
                  {t("settings.deletePasswordLabel")}
                </label>
                <Input
                  id="delete-password"
                  type="password"
                  className="mt-1.5"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-[var(--mistake-muted)] px-3 py-2 text-sm text-[var(--mistake)]">
                {error}
              </p>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={close} disabled={deleting}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="danger" size="sm" disabled={!ready || deleting}>
                {deleting ? t("settings.deleting") : t("settings.deleteConfirm")}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}
