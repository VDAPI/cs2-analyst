import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent-muted)] text-[var(--accent-hover)]",
        success: "bg-[var(--success-muted)] text-[var(--success)]",
        error: "bg-[var(--error-muted)] text-[var(--error)]",
        warning: "bg-[var(--warning-muted)] text-[var(--warning)]",
        ct: "bg-[var(--ct-blue-muted)] text-[var(--ct-blue)]",
        t: "bg-[var(--t-gold-muted)] text-[var(--t-gold)]",
        neutral:
          "bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}
