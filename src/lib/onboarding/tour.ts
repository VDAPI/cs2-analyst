/**
 * The report guide (S21): a few steps over the parts of a report, shown the
 * first time a player opens one (and on the public example at /demo). Each
 * step points at an element marked `data-tour="<key>"`; a step whose element
 * isn't on the page (no pro table yet, read-only view) is skipped.
 */

export type TourKey = "player" | "summary" | "top" | "advice" | "clip" | "vs-pro" | "all" | "actions" | "signup";

/** Where the guide runs: the player's own report, or the public example. */
export type TourContext = "app" | "demo";

const ORDER: Record<TourContext, TourKey[]> = {
  app: ["player", "summary", "top", "advice", "clip", "vs-pro", "all", "actions"],
  demo: ["player", "summary", "top", "advice", "clip", "vs-pro", "all", "signup"],
};

/** The steps of the guide, in order (before skipping the ones not on the page). */
export function tourSteps(context: TourContext): TourKey[] {
  return ORDER[context];
}

/** Keep only the steps whose element is on the page. */
export function presentSteps(steps: TourKey[], has: (key: TourKey) => boolean): TourKey[] {
  return steps.filter(has);
}

/** Browser key that remembers a finished guide (visitors, and as a fallback for players). */
export const TOUR_STORAGE_KEY = "cs2a-report-tour";
