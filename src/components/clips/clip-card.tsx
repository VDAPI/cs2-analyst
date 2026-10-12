"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { Badge, buttonVariants } from "@/components/ui";
import { FindingClip } from "@/components/replay/finding-clip";
import { ShareButton } from "@/components/share/share-button";
import type { RadarConfig } from "@/lib/canvas/radar";
import type { ClipShare } from "@/lib/clips/clip";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils/cn";

export interface ClipCardProps {
  matchId: string;
  mapName: string;
  mapConfig: RadarConfig | null;
  round: number;
  title: string;
  /** "Mirage · R14 · 12.10.2026". */
  meta: string;
  playerName: string;
  badge: { label: string; variant: "lime" | "error" | "default" };
  steamId: string;
  clip: ClipShare;
  replayHref: string;
  /** Loads on scroll (the first cards); the rest on a tap. */
  autoLoad?: boolean;
}

/** One clip on /clips: the 2D preview with MP4/GIF download, a public link and a jump into the replay. */
export function ClipCard({ matchId, mapName, mapConfig, round, title, meta, playerName, badge, steamId, clip, replayHref, autoLoad }: ClipCardProps) {
  const t = useT();
  return (
    <article className="flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
      <header className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="truncate text-xs text-[var(--text-secondary)]">{playerName}</p>
          <p className="truncate font-mono text-xs text-[var(--text-tertiary)]">{meta}</p>
        </div>
        <Badge variant={badge.variant} className="shrink-0">
          {badge.label}
        </Badge>
      </header>
      <FindingClip
        matchId={matchId}
        mapName={mapName}
        mapConfig={mapConfig}
        roundNumber={round}
        tick={clip.focus}
        steamId={steamId}
        targetSteamId={clip.target ?? null}
        severity={clip.severity ?? "low"}
        clip={{ before: 0, after: 0 }}
        range={{ from: clip.from, to: clip.to }}
        follow={clip.follow}
        marks={clip.marks}
        marker={clip.kind === "finding"}
        autoLoad={autoLoad}
        label={`${title}, ${playerName}`}
        exportInfo={{ title, subtitle: `${playerName} · ${mapName} · R${round}`, map: mapName, round }}
      />
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <ShareButton
          label={t("clips.shareClip")}
          hint={t("clips.shareHint")}
          request={{ kind: "clip", matchId, steamId, round, clip }}
        />
        <Link href={replayHref} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          <Play className="h-3.5 w-3.5" aria-hidden />
          {t("clips.inReplay")}
        </Link>
      </div>
    </article>
  );
}
