import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface ToolHeaderProps {
  backHref: string;
  backLabel?: string;
  title: string;
  /** Small overline above the title, e.g. the tool name. */
  overline?: string;
  scoreCT?: number;
  scoreT?: number;
  loading?: boolean;
  loadingLabel?: string;
  /** Right-aligned controls (mode switch …); wraps under the title on mobile. */
  actions?: ReactNode;
  meta?: ReactNode;
}

/** Header shared by the replay, heatmap, grenade and economy screens. */
export function ToolHeader({
  backHref,
  backLabel = "Wróć",
  title,
  overline,
  scoreCT,
  scoreT,
  loading,
  loadingLabel = "Ładowanie…",
  actions,
  meta,
}: ToolHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <Link
          href={backHref}
          className="-ml-1 mb-1 inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 text-sm text-[var(--text-tertiary)] transition-colors duration-150 hover:text-[var(--text-secondary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        {overline && <p className="label-overline text-[var(--accent)]">{overline}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">{title}</h1>
          {scoreCT != null && scoreT != null && (
            <span className="flex items-center gap-1.5 font-mono text-lg font-bold tabular-nums">
              <span className="text-[var(--ct-blue)]">{scoreCT}</span>
              <span className="text-[var(--text-disabled)]">:</span>
              <span className="text-[var(--t-gold)]">{scoreT}</span>
            </span>
          )}
          {meta}
          {loading && (
            <span className="flex items-center gap-2" role="status">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
              <span className="text-[13px] text-[var(--text-tertiary)]">{loadingLabel}</span>
            </span>
          )}
        </div>
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
