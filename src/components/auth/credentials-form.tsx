"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

interface CredentialsFormProps {
  mode: "login" | "register";
}

export function CredentialsForm({ mode }: CredentialsFormProps) {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        if (password !== confirmPassword) {
          setError(t("auth.passwordsDiffer"));
          setLoading(false);
          return;
        }

        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name || undefined, email, password }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? t("auth.registerFailed"));
          setLoading(false);
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t("auth.invalidCredentials"));
        setLoading(false);
        return;
      }

      router.push(safeCallbackUrl());
    } catch {
      setError(t("common.error"));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === "register" && (
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
            {t("auth.name")}
          </label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("auth.namePlaceholder")}
          />
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
          {t("auth.email")}
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.emailPlaceholder")}
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
          {t("auth.password")}
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "register" ? t("auth.passwordPlaceholderRegister") : t("auth.passwordPlaceholderLogin")}
          required
          minLength={mode === "register" ? 8 : undefined}
        />
      </div>

      {mode === "register" && (
        <div>
          <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
            {t("auth.confirmPassword")}
          </label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t("auth.confirmPassword")}
            required
          />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border-l-[3px] border-[var(--mistake)] bg-[var(--mistake-muted)] px-3 py-2 text-sm text-[var(--mistake)]">
          {error}
        </p>
      )}

      <Button type="submit" variant="cta" size="lg" className="w-full" disabled={loading}>
        {loading
          ? mode === "register"
            ? t("auth.creatingAccount")
            : t("auth.signingIn")
          : mode === "register"
            ? t("auth.createAccount")
            : t("auth.signIn")}
      </Button>
    </form>
  );
}

/** Where to go after login: the middleware's `callbackUrl` when it is a same-site path. */
function safeCallbackUrl(): string {
  const raw = new URLSearchParams(window.location.search).get("callbackUrl");
  if (!raw) return "/matches";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return "/matches";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/matches";
  }
}
