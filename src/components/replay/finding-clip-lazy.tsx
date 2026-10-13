"use client";

import { lazy, Suspense } from "react";
import type { FindingClipProps } from "./finding-clip";

const FindingClipImpl = lazy(() => import("./finding-clip").then((m) => ({ default: m.FindingClip })));

/**
 * `FindingClip` with its canvas and drawing code in a chunk of their own
 * (S28). Server-rendered as before; the browser fetches the chunk after the
 * page's own scripts and hydrates the clip then, so a report full of clips
 * doesn't make a phone download and run the replay renderer up front.
 */
export function LazyFindingClip(props: FindingClipProps) {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden
          className={`aspect-square w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] ${props.className ?? ""}`}
        />
      }
    >
      <FindingClipImpl {...props} />
    </Suspense>
  );
}
