"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils/cn";

interface ProgressProps {
  /** 0–100. Omit for an indeterminate bar (e.g. "w kolejce"). */
  value?: number | null;
  label?: string;
  showValue?: boolean;
  className?: string;
}

/** Violet while running, lime when complete (analysis queue). */
export function Progress({ value, label, showValue, className }: ProgressProps) {
  const indeterminate = value === undefined || value === null;
  const clamped = indeterminate ? 0 : Math.min(100, Math.max(0, value));
  const done = clamped >= 100;

  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
          {label && <span className="truncate text-[var(--text-secondary)]">{label}</span>}
          {showValue && !indeterminate && (
            <span className="font-mono tabular-nums text-[var(--text-tertiary)]">
              {Math.round(clamped)}%
            </span>
          )}
        </div>
      )}
      <ProgressPrimitive.Root
        value={indeterminate ? null : clamped}
        aria-label={label}
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-4)]"
      >
        <ProgressPrimitive.Indicator
          className={cn(
            "h-full rounded-full transition-[width,background-color] duration-300 ease-out",
            done ? "bg-[var(--accent-2)]" : "bg-[var(--accent)]",
            indeterminate && "w-2/5 animate-progress-indeterminate"
          )}
          style={indeterminate ? undefined : { width: `${clamped}%` }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
}
