import Link from "next/link";
import { Crosshair } from "lucide-react";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

/** Shared frame of the login and register screens (Violet Lime). */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Neon backdrop: violet grid + two soft glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_50%_30%,black_20%,transparent_70%)]"
          style={{
            backgroundImage:
              "linear-gradient(var(--divider) 1px, transparent 1px), linear-gradient(90deg, var(--divider) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-[var(--accent-muted)] blur-[120px]" />
        <div className="absolute -bottom-48 right-[-10%] h-[360px] w-[360px] rounded-full bg-[var(--accent-2-muted)] opacity-50 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in">
        <Link href="/" className="mx-auto mb-8 flex w-fit items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] shadow-[0_0_24px_var(--accent-glow)]">
            <Crosshair className="h-5 w-5 text-[var(--on-accent)]" strokeWidth={2.5} />
          </span>
          <span className="font-display text-xl font-bold tracking-wide text-[var(--text-primary)]">
            CS2 <span className="text-[var(--accent-2)]">Analyst</span>
          </span>
        </Link>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-[var(--shadow-lg)] sm:p-6">
          <div className="mb-6 text-center">
            <h1 className="font-display text-[26px] font-bold leading-tight text-[var(--text-primary)] md:text-[32px]">
              {title}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{subtitle}</p>
          </div>
          {children}
        </div>

        <p className="mt-6 text-center text-sm text-[var(--text-tertiary)]">{footer}</p>
        <div className="mt-4 flex justify-center">
          <LanguageSwitcher size="sm" />
        </div>
      </div>
    </main>
  );
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-3">
      <div className="h-px flex-1 bg-[var(--border)]" />
      <span className="label-overline text-[var(--text-tertiary)]">{label}</span>
      <div className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}
