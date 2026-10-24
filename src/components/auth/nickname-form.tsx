"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { safeCallbackUrl } from "@/components/auth/credentials-form";

/** First Steam sign-in (/welcome): keep the Steam name or pick another nickname. */
export function NicknameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const t = useT();
  const { update } = useSession();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 50) {
      setError(t("auth.nicknameInvalid"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (trimmed !== initialName) {
        const res = await fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!res.ok) {
          setError(t("common.error"));
          setLoading(false);
          return;
        }
        // The JWT carries the name: refresh it so the header shows the new one.
        await update();
      }
      router.push(safeCallbackUrl());
    } catch {
      setError(t("common.error"));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="nickname" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
          {t("auth.welcomeNickname")}
        </label>
        <Input
          id="nickname"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("auth.namePlaceholder")}
          maxLength={50}
          autoFocus
          required
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border-l-[3px] border-[var(--mistake)] bg-[var(--mistake-muted)] px-3 py-2 text-sm text-[var(--mistake)]">
          {error}
        </p>
      )}

      <Button type="submit" variant="cta" size="lg" className="w-full" disabled={loading}>
        {loading ? t("auth.welcomeSaving") : t("auth.welcomeSave")}
      </Button>
      {initialName && (
        <button
          type="button"
          onClick={() => router.push(safeCallbackUrl())}
          className="w-full text-center text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        >
          {t("auth.welcomeSkip")}
        </button>
      )}
    </form>
  );
}
