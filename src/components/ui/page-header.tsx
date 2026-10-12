import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small uppercase line above the title (e.g. "Analiza"). */
  eyebrow?: React.ReactNode;
  /** Buttons on the right; wraps under the title on phones. */
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
}

/** Title block every app screen starts with. */
export function PageHeader({ title, description, eyebrow, actions, back, className }: PageHeaderProps) {
  return (
    <header className={cn("space-y-3", className)}>
      {back && (
        <Link
          href={back.href}
          className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)] md:min-h-0"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="label-overline text-[var(--accent)]">{eyebrow}</p>}
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] md:text-[28px]">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
