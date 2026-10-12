import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Upload } from "lucide-react";
import { Card, buttonVariants } from "@/components/ui";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { getMapConfig } from "@/lib/utils/maps";
import { cn } from "@/lib/utils/cn";

export interface ToolMatch {
  id: string;
  map: string;
  date: Date;
  scoreCT: number;
  scoreT: number;
}

export function radarUrl(map: string): string {
  return getMapConfig(map)?.radarImage ?? `/maps/${map}_radar.png`;
}

export function formatMatchDate(date: Date): string {
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
}

/** Picker of the user's matches that opens a tool (replay, heatmap, grenades, economy). */
export function ToolMatchGrid({
  matches,
  hrefBase,
  icon: Icon,
  actionLabel,
}: {
  matches: ToolMatch[];
  hrefBase: string;
  icon: LucideIcon;
  actionLabel: string;
}) {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
      {matches.map((m) => (
        <Link
          key={m.id}
          href={`${hrefBase}/${m.id}`}
          className="group rounded-xl focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-glow)]"
        >
          <Card className="relative overflow-hidden p-0 md:p-0 group-hover:border-[var(--border-active)]">
            <div className="relative h-28 overflow-hidden">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-40 grayscale transition-transform duration-200 group-hover:scale-105"
                style={{ backgroundImage: `url(${radarUrl(m.map)})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface-1)] to-transparent" />
              <span className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] backdrop-blur-md transition-colors duration-150 group-hover:bg-[var(--accent)] group-hover:text-[var(--on-accent)]">
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <div className="flex items-end justify-between gap-3 px-4 pb-4">
              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold text-[var(--text-primary)]">
                  {mapDisplayName(m.map)}
                </p>
                <p className="text-[13px] text-[var(--text-tertiary)]">{formatMatchDate(m.date)}</p>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                <span className="text-[var(--ct-blue)]">{m.scoreCT}</span>
                <span className="text-[var(--text-disabled)]">:</span>
                <span className="text-[var(--t-gold)]">{m.scoreT}</span>
              </span>
            </div>
            <span className="sr-only">{actionLabel}</span>
          </Card>
        </Link>
      ))}
    </div>
  );
}

/** Empty state shared by the tool pickers: one lime CTA to upload a demo. */
export function ToolEmptyState({ title, text }: { title: string; text: string }) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="font-display text-lg font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-[var(--text-tertiary)]">{text}</p>
      <Link href="/upload" className={cn(buttonVariants({ variant: "cta" }), "mt-5")}>
        <Upload className="h-4 w-4" />
        Wgraj pierwsze demo
      </Link>
    </Card>
  );
}

export function ToolPageIntro({ overline, title, text }: { overline: string; title: string; text: string }) {
  return (
    <div>
      <p className="label-overline text-[var(--accent)]">{overline}</p>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{text}</p>
    </div>
  );
}
