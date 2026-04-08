import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

/* ─── Button ──────────────────────────────────────────── */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] hover:shadow-[0_0_20px_var(--accent-glow)]",
        secondary:
          "border border-[var(--border)] bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:bg-[rgba(255,255,255,0.10)] hover:text-[var(--text-primary)]",
        ghost:
          "text-[var(--text-tertiary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-secondary)]",
        danger:
          "bg-[var(--error-muted)] text-[var(--error)] hover:bg-[rgba(239,68,68,0.25)]",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-8 text-sm",
        icon: "h-9 w-9",
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

/* ─── Card ────────────────────────────────────────────── */

export function Card({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 transition-colors hover:border-[var(--border-hover)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ─── Stat Card ───────────────────────────────────────── */

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: number; // positive = good, negative = bad
  accentColor?: string;
}

export function StatCard({ label, value, trend, accentColor }: StatCardProps) {
  return (
    <Card
      className="border-t-2"
      style={{ borderTopColor: accentColor ?? "var(--accent)" }}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="stat-number mt-2 text-[var(--text-primary)]">{value}</p>
      {trend !== undefined && (
        <p
          className={`mt-1 text-xs font-medium ${
            trend >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"
          }`}
        >
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
        </p>
      )}
    </Card>
  );
}

/* ─── Badge ───────────────────────────────────────────── */

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
