import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3.5 py-2.5 text-[15px] text-[var(--text-primary)] transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--text-disabled)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)] focus:outline-none disabled:opacity-40 md:text-sm",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
