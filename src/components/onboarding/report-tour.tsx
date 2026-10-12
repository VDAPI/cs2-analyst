"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Compass, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils/cn";
import { TOUR_STORAGE_KEY, presentSteps, tourSteps, type TourContext, type TourKey } from "@/lib/onboarding/tour";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;

function anchor(key: TourKey): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${key}"]`);
}

function readDone(): boolean {
  try {
    return window.localStorage.getItem(TOUR_STORAGE_KEY) === "done";
  } catch {
    return false;
  }
}

function writeDone() {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, "done");
  } catch {
    // Private mode or blocked storage: the guide just shows again next time.
  }
}

/**
 * The report guide (S21): a ring around one part of the report and a card
 * with what it is, step by step. Opens by itself the first time (`autoStart`:
 * the account has never finished it, or a visitor's browser hasn't), and
 * always from the "Jak czytać raport" button. Finishing or skipping is
 * remembered in the browser and, for a signed-in player, on the account.
 */
export function ReportTour({
  context,
  autoStart,
  persist,
  className,
}: {
  context: TourContext;
  /** Open on load (still skipped when this browser already finished it). */
  autoStart: boolean;
  /** Also remember on the account (signed-in player). */
  persist: boolean;
  className?: string;
}) {
  const t = useT();
  const titleId = useId();
  const [steps, setSteps] = useState<TourKey[] | null>(null);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const start = useCallback(() => {
    const found = presentSteps(tourSteps(context), (k) => anchor(k) != null);
    if (found.length === 0) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIndex(0);
    setSteps(found);
  }, [context]);

  const remember = useCallback(() => {
    writeDone();
    if (persist) {
      void fetch("/api/user/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(
        () => null
      );
    }
  }, [persist]);

  useEffect(() => {
    if (!autoStart) return;
    // Already seen in this browser (e.g. on /demo before signing up): just note it on the account.
    if (readDone()) {
      remember();
      return;
    }
    // After the first paint, so the report's sections are in the DOM.
    const id = window.setTimeout(start, 300);
    return () => window.clearTimeout(id);
  }, [autoStart, start, remember]);

  const finish = useCallback(() => {
    setSteps(null);
    setBox(null);
    remember();
    opener.current?.focus();
  }, [remember]);

  const key = steps?.[index] ?? null;

  // Scroll the step's part into view and keep the ring on it.
  useLayoutEffect(() => {
    if (!key) return;
    const el = anchor(key);
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Near the top, under the sticky top bar: the card sits at the bottom of the screen.
    el.style.scrollMarginTop = "88px";
    el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
      });
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [key]);

  useEffect(() => {
    if (!key) return;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, finish]);

  const total = steps?.length ?? 0;
  const last = index === total - 1;

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={start} className={className}>
        <Compass className="h-3.5 w-3.5" aria-hidden />
        {t("onboarding.tour.open")}
      </Button>
      {key && (
        <>
          {box && (
            <div
              aria-hidden
              className="pointer-events-none fixed z-[70] rounded-xl border-2 border-[var(--accent-2)] shadow-[0_0_0_9999px_rgba(8,7,13,0.6),0_0_24px_var(--accent-glow)] transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
              style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
            />
          )}
          <div
            ref={cardRef}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            tabIndex={-1}
            data-testid="report-tour"
            className={cn(
              "fixed inset-x-3 z-[71] rounded-2xl border border-[var(--border-active)] bg-[var(--surface-2)] p-4 shadow-[var(--shadow-xl)] focus:outline-none md:inset-x-auto md:bottom-6 md:right-6 md:w-[380px]",
              context === "app" ? "bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+12px)]" : "bottom-3"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="label-overline text-[var(--accent-2)]">
                {t("onboarding.tour.label")} ·{" "}
                <span className="font-mono">{t("onboarding.tour.step", { n: index + 1, total })}</span>
              </p>
              <button
                type="button"
                onClick={finish}
                aria-label={t("onboarding.tour.skip")}
                className="-m-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <h2 id={titleId} className="mt-1 font-display text-lg font-semibold text-[var(--text-primary)]">
              {t(`onboarding.tour.${key}.title`)}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{t(`onboarding.tour.${key}.body`)}</p>
            <div className="mt-3 flex items-center gap-1" aria-hidden>
              {steps?.map((s, i) => (
                <span
                  key={s}
                  className={cn("h-1.5 flex-1 rounded-full", i <= index ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]")}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={finish}>
                {t("onboarding.tour.skip")}
              </Button>
              <span className="flex-1" />
              {index > 0 && (
                <Button type="button" variant="secondary" size="sm" onClick={() => setIndex((i) => i - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  {t("onboarding.tour.back")}
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => (last ? finish() : setIndex((i) => i + 1))}
              >
                {last ? t("onboarding.tour.done") : t("onboarding.tour.next")}
                {!last && <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
