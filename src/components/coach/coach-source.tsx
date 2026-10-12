"use client";

import { Bot, BookOpen, Loader2, RefreshCw } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import type { CoachStatus } from "@/lib/coach/text";
import { useT } from "@/lib/i18n/client";

/** Who wrote the text (AI or standard advice), a "writing…" state and why the AI isn't used. */
export function CoachSource({
  status,
  writing,
  aiEnabled,
  onRewrite,
}: {
  status: CoachStatus;
  writing: boolean;
  aiEnabled: boolean;
  onRewrite?: () => void;
}) {
  const t = useT();
  const note =
    status === "off" || (!aiEnabled && status !== "ai")
      ? t("coach.aiOff")
      : status === "limit"
        ? t("coach.aiLimit")
        : status === "failed" && !writing
          ? t("coach.aiFailed")
          : null;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {writing ? (
          <Badge variant="default" aria-live="polite">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            {t("coach.writing")}
          </Badge>
        ) : status === "ai" ? (
          <Badge variant="lime" title={t("coach.sourceAiHint")}>
            <Bot className="h-3 w-3" aria-hidden />
            {t("coach.sourceAi")}
          </Badge>
        ) : (
          <Badge variant="neutral">
            <BookOpen className="h-3 w-3" aria-hidden />
            {t("coach.sourceRules")}
          </Badge>
        )}
        {onRewrite && aiEnabled && status === "ai" && !writing && (
          <Button variant="ghost" size="sm" onClick={onRewrite}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t("coach.rewrite")}
          </Button>
        )}
      </div>
      {status === "ai" && <p className="text-xs text-[var(--text-tertiary)]">{t("coach.sourceAiHint")}</p>}
      {note && <p className="text-xs text-[var(--text-tertiary)]">{note}</p>}
    </div>
  );
}
