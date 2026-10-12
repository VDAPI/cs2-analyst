import { Badge, Card } from "@/components/ui";
import { lineupName, setposCommand, type Lineup } from "@/lib/analysis/lineups";
import type { ThrowTechnique } from "@/lib/analysis/utility";
import { grenadeStyle } from "@/lib/canvas/palette";
import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils/cn";
import { CopySetpos } from "./copy-setpos";
import { MasteryToggle } from "./mastery-toggle";

const TECH_KEY: Record<ThrowTechnique, MessageKey> = {
  stand: "lineups.techStand",
  walk: "lineups.techWalk",
  run: "lineups.techRun",
  jump: "lineups.techJump",
};

/**
 * One lineup of the base: name, how it's thrown, the setpos/setang to copy
 * and the "mastered" toggle (S11, S22). `note` explains why it's suggested.
 */
export function LineupCard({
  lineup: l,
  index,
  map,
  mastered,
  note,
  t,
}: {
  lineup: Lineup;
  index: number;
  map: string;
  mastered: boolean;
  note?: string | null;
  t: TFunction;
}) {
  const cmd = setposCommand(l);
  return (
    <li className="min-w-0">
      <Card className={cn("h-full min-w-0 space-y-3 p-4 md:p-4", mastered && "border-[var(--good)]")}>
        <div className="flex items-start gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold text-[var(--on-accent)]"
            style={{ backgroundColor: grenadeStyle(l.type).token }}
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-display text-base font-semibold text-[var(--text-primary)]">{lineupName(l, index)}</h3>
            <p className="font-mono text-xs text-[var(--text-tertiary)]">
              {t("lineups.samples", { n: l.samples, matches: l.matches })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="neutral">{t(TECH_KEY[l.technique])}</Badge>
          {l.side === "both" ? (
            <Badge variant="neutral">{t("lineups.sideBoth")}</Badge>
          ) : (
            <Badge variant={l.side === "CT" ? "ct" : "t"}>{l.side}</Badge>
          )}
          {mastered && <Badge variant="success">{t("lineups.masteredBadge")}</Badge>}
        </div>
        {note && <p className="text-sm text-[var(--text-secondary)]">{note}</p>}
        <code className="block break-all rounded-lg bg-[var(--surface-2)] px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
          {cmd}
        </code>
        <div className="flex flex-wrap gap-2">
          <CopySetpos command={cmd} />
          <MasteryToggle map={map} lineupKey={l.key} initial={mastered} />
        </div>
      </Card>
    </li>
  );
}
