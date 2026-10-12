"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
}

/** 20px checkbox with a lime fill when checked (match selection, S7). */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, disabled, ...props }, ref) => {
    return (
      <label
        htmlFor={id}
        className={cn(
          "inline-flex cursor-pointer select-none items-center gap-2.5 text-sm text-[var(--text-secondary)] max-md:min-h-11",
          disabled && "cursor-not-allowed opacity-40",
          className
        )}
      >
        <span className="relative inline-flex h-5 w-5 shrink-0">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            disabled={disabled}
            className="peer h-5 w-5 cursor-pointer appearance-none rounded-[5px] border border-[var(--border-hover)] bg-[var(--surface-4)] transition-colors duration-150 checked:border-[var(--accent-2)] checked:bg-[var(--accent-2)] hover:border-[var(--accent)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-glow)] disabled:cursor-not-allowed"
            {...props}
          />
          <Check
            aria-hidden
            strokeWidth={3}
            className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 text-[var(--on-accent)] opacity-0 peer-checked:opacity-100"
          />
        </span>
        {label}
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";
