import { AlertTriangle, CheckCircle2, Info, XOctagon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type FindingSeverity = "high" | "medium" | "low" | "good";

const severityStyles: Record<
  FindingSeverity,
  { label: string; className: string; icon: typeof Info }
> = {
  high: {
    label: "Poważny błąd",
    className: "bg-[var(--mistake-muted)] text-[var(--mistake)]",
    icon: XOctagon,
  },
  medium: {
    label: "Do poprawy",
    className: "bg-[var(--warning-muted)] text-[var(--warning)]",
    icon: AlertTriangle,
  },
  low: {
    label: "Wskazówka",
    className: "bg-[var(--accent-muted)] text-[var(--accent-hover)]",
    icon: Info,
  },
  good: {
    label: "Dobra decyzja",
    className: "bg-[var(--good-muted)] text-[var(--good)]",
    icon: CheckCircle2,
  },
};

interface FindingTagProps {
  severity: FindingSeverity;
  /** Overrides the default severity label (e.g. "Strzał w ruchu"). */
  children?: React.ReactNode;
  className?: string;
}

/** Severity tag for a detected mistake. Never colour-only: always icon + text. */
export function FindingTag({ severity, children, className }: FindingTagProps) {
  const style = severityStyles[severity];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        style.className,
        className
      )}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {children ?? style.label}
    </span>
  );
}
