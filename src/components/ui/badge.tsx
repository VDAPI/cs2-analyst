import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent-muted)] text-[var(--accent-hover)]",
        lime: "bg-[var(--accent-2-muted)] text-[var(--accent-2)]",
        success: "bg-[var(--good-muted)] text-[var(--good)]",
        error: "bg-[var(--mistake-muted)] text-[var(--mistake)]",
        warning: "bg-[var(--warning-muted)] text-[var(--warning)]",
        info: "bg-[var(--info-muted)] text-[var(--info)]",
        ct: "bg-[var(--ct-blue-muted)] text-[var(--ct-blue)]",
        t: "bg-[var(--t-gold-muted)] text-[var(--t-gold)]",
        neutral: "bg-[rgba(190,160,255,0.08)] text-[var(--text-secondary)]",
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
