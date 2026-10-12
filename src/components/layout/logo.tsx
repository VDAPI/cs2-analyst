import Link from "next/link";
import { Crosshair } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Logo({
  compact,
  className,
  onClick,
}: {
  compact?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link href="/matches" onClick={onClick} aria-label="CS2 Analyst" className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] shadow-[0_0_16px_var(--accent-glow)]">
        <Crosshair className="h-4 w-4 text-[var(--on-accent)]" strokeWidth={2.5} />
      </span>
      {!compact && (
        <span className="truncate font-display text-base font-bold tracking-wide text-[var(--text-primary)]">
          CS2 <span className="text-[var(--accent-2)]">Analyst</span>
        </span>
      )}
    </Link>
  );
}
