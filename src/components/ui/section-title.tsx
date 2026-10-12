import { cn } from "@/lib/utils/cn";

/** h2 for a block of content inside a screen. */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center justify-between gap-2", className)}>
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">{children}</h2>
      {action}
    </div>
  );
}
