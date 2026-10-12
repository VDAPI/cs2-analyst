"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type SegmentTone = "accent" | "ct" | "t" | "mistake" | "neutral";

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  tone?: SegmentTone;
  /** Accessible name when `label` is an icon. */
  ariaLabel?: string;
}

const ACTIVE_TONE: Record<SegmentTone, string> = {
  accent: "bg-[var(--accent-muted)] text-[var(--accent-hover)]",
  ct: "bg-[var(--ct-blue-muted)] text-[var(--ct-blue)]",
  t: "bg-[var(--t-gold-muted)] text-[var(--t-gold)]",
  mistake: "bg-[var(--mistake-muted)] text-[var(--mistake)]",
  neutral: "bg-[var(--surface-3)] text-[var(--text-primary)]",
};

interface SegmentedProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  options: SegmentOption<V>[];
  label: string;
  className?: string;
  size?: "sm" | "md";
}

/** Single-choice pill group (side filter, chart mode, speed). 44px tall on touch. */
export function Segmented<V extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = "md",
}: SegmentedProps<V>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-glow)] max-md:min-h-10",
              size === "sm" ? "h-7" : "h-8",
              active
                ? ACTIVE_TONE[o.tone ?? "accent"]
                : "text-[var(--text-tertiary)] hover:bg-[rgba(190,160,255,0.06)] hover:text-[var(--text-secondary)]"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Uppercase label + content block used in tool filter panels. */
export function ControlGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="label-overline mb-2 text-[var(--text-tertiary)]">{label}</p>
      {children}
    </div>
  );
}

/** On/off switch with a visible text label. */
export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg text-left text-sm text-[var(--text-secondary)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-glow)]"
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-150",
          checked ? "bg-[var(--accent)]" : "bg-[var(--surface-4)]"
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--text-primary)] transition-transform duration-150",
            checked && "translate-x-4"
          )}
        />
      </span>
    </button>
  );
}

/** Native select styled for the dark theme; 44px on touch. */
export function ToolSelect({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none max-md:h-11",
        className
      )}
      {...props}
    />
  );
}
