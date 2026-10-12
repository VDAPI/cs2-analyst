import Link from "next/link";
import { ArrowLeft, Crosshair, FileWarning } from "lucide-react";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getT } from "@/lib/i18n/server";
import { LEGAL_UPDATED, legalDoc } from "@/lib/legal/content";
import { formatDate } from "@/lib/utils/formatters";

/** Privacy policy / terms of service (S29): public, readable from 360 px. */
export async function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { t, locale } = await getT();
  const doc = legalDoc(kind, locale);
  const other = kind === "privacy" ? "terms" : "privacy";
  return (
    <main className="min-h-dvh px-4 py-8 sm:px-6 sm:py-12">
      <article className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]">
              <Crosshair className="h-4 w-4 text-[var(--on-accent)]" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="truncate">{t("legal.back")}</span>
          </Link>
          <LanguageSwitcher size="sm" />
        </div>

        <h1 className="font-display text-[28px] font-bold leading-tight text-[var(--text-primary)] md:text-[36px]">
          {t(kind === "privacy" ? "legal.privacy" : "legal.terms")}
        </h1>
        <p className="mt-2 font-mono text-xs text-[var(--text-tertiary)]">
          {t("legal.updated", { date: formatDate(LEGAL_UPDATED) })}
        </p>
        <p
          role="note"
          className="mt-4 flex items-start gap-2 rounded-lg border-l-[3px] border-[var(--warning)] bg-[var(--warning-muted)] px-3 py-2 text-sm text-[var(--warning)]"
        >
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t("legal.draft")}</span>
        </p>

        <p className="mt-6 text-[15px] leading-relaxed text-[var(--text-secondary)]">{doc.intro}</p>

        {doc.sections.map((s) => (
          <section key={s.title} className="mt-8">
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">{s.title}</h2>
            {s.paragraphs?.map((p) => (
              <p key={p} className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {p}
              </p>
            ))}
            {s.bullets && (
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--text-secondary)] marker:text-[var(--accent)]">
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <footer className="mt-12 flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--border)] pt-6 text-sm text-[var(--text-tertiary)]">
          <Link href={`/${other}`} className="text-[var(--accent)] hover:text-[var(--accent-hover)]">
            {t(other === "privacy" ? "legal.privacy" : "legal.terms")}
          </Link>
          <span>{t("legal.footerIndependent")}</span>
        </footer>
      </article>
    </main>
  );
}
