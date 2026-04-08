"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface CredentialsFormProps {
  mode: "login" | "register";
}

export function CredentialsForm({ mode }: CredentialsFormProps) {
  const router = useRouter();
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
          setError("Passwords do not match");
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
          setError(data.error ?? "Registration failed");
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
        setError("Invalid email or password");
        setLoading(false);
        return;
      }

      router.push("/matches");
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === "register" && (
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm text-[var(--text-secondary)]">
            Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            className={inputClass}
          />
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm text-[var(--text-secondary)]">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm text-[var(--text-secondary)]">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "register" ? "Min. 8 characters" : "Your password"}
          required
          minLength={mode === "register" ? 8 : undefined}
          className={inputClass}
        />
      </div>

      {mode === "register" && (
        <div>
          <label htmlFor="confirmPassword" className="mb-1.5 block text-sm text-[var(--text-secondary)]">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat your password"
            required
            className={inputClass}
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-[var(--error-muted)] px-3 py-2 text-sm text-[var(--error)]">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading
          ? mode === "register"
            ? "Creating account..."
            : "Signing in..."
          : mode === "register"
            ? "Create Account"
            : "Sign In"}
      </Button>
    </form>
  );
}
