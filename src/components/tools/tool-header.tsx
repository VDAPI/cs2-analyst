import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";

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

/** PageHeader for the replay, heatmap, grenade and economy screens: map name, score, loading state. */
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
    <PageHeader
      back={{ href: backHref, label: backLabel }}
      eyebrow={overline}
      actions={actions}
      title={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{title}</span>
          {scoreCT != null && scoreT != null && (
            <span className="flex items-center gap-1.5 font-mono text-lg font-bold tabular-nums">
              <span className="text-[var(--ct-blue)]">{scoreCT}</span>
              <span className="text-[var(--text-disabled)]">:</span>
              <span className="text-[var(--t-gold)]">{scoreT}</span>
            </span>
          )}
          {meta}
          {loading && (
            <span className="flex items-center gap-2 font-sans" role="status">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
              <span className="text-[13px] font-normal text-[var(--text-tertiary)]">{loadingLabel}</span>
            </span>
          )}
        </span>
      }
    />
  );
}
