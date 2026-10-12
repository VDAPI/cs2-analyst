import { CheckCircle2, FlaskConical, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TONES = {
  test: { icon: FlaskConical, cls: "border-[var(--accent-2)] bg-[var(--accent-2-muted)] text-[var(--accent-2)]" },
  info: { icon: Info, cls: "border-[var(--warning)] bg-[var(--warning-muted)] text-[var(--warning)]" },
  success: { icon: CheckCircle2, cls: "border-[var(--good)] bg-[var(--good-muted)] text-[var(--good)]" },
  error: { icon: XCircle, cls: "border-[var(--mistake)] bg-[var(--mistake-muted)] text-[var(--mistake)]" },
} as const;

/** One-line banner on /pricing and /billing (test mode, checkout result, payments off). */
export function BillingNotice({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  const { icon: Icon, cls } = TONES[tone];
  return (
    <p
      role={tone === "error" ? "alert" : "note"}
      className={cn("flex items-start gap-2 rounded-lg border-l-[3px] px-3 py-2 text-sm", cls)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
