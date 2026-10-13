"use client";

import { useEffect, useRef } from "react";

/**
 * Homepage hero backdrop: neon CS soldier silhouettes running along map-like
 * routes, each leaving a short trail (drawing in hero-runners-engine.ts).
 *
 * The canvas is server-rendered; its drawing code is a separate chunk loaded
 * once the browser is idle after the first paint, so the animation never
 * competes with the page's own loading on a phone (S28).
 */
export function HeroRunners({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    const start = () => {
      void import("./hero-runners-engine").then(({ startHeroRunners }) => {
        if (!cancelled && canvasRef.current) cleanup = startHeroRunners(canvasRef.current);
      });
    };
    const idle = typeof window.requestIdleCallback === "function";
    const handle = idle ? window.requestIdleCallback(start, { timeout: 2000 }) : window.setTimeout(start, 200);
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      cleanup?.();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
