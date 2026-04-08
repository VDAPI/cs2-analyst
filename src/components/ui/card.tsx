import { cn } from "@/lib/utils/cn";

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
