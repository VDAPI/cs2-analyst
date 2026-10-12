import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-glow)] disabled:pointer-events-none disabled:opacity-40 max-md:min-h-11",
  {
    variants: {
      variant: {
        /** Lime — the one main call to action of a screen. */
        cta:
          "bg-[var(--accent-2)] text-[var(--on-accent)] hover:bg-[var(--accent-2-hover)] hover:shadow-[0_0_24px_var(--accent-2-glow)]",
        /** Violet — every other main action. */
        primary:
          "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] hover:shadow-[0_0_20px_var(--accent-glow)] active:bg-[var(--accent-active)]",
        secondary:
          "border border-[var(--border)] bg-[rgba(190,160,255,0.06)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:bg-[rgba(190,160,255,0.10)] hover:text-[var(--text-primary)]",
        ghost:
          "text-[var(--text-tertiary)] hover:bg-[rgba(190,160,255,0.06)] hover:text-[var(--text-secondary)]",
        danger:
          "bg-[var(--mistake-muted)] text-[var(--mistake)] hover:bg-[rgba(255,77,106,0.25)]",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-[18px] text-sm",
        lg: "h-12 px-8 text-sm",
        icon: "h-9 w-9 max-md:min-w-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
