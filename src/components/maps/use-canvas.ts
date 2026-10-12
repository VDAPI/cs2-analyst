"use client";

import { useEffect, useState, type RefObject } from "react";

/** Loads a radar PNG; `null` until loaded or when it fails (callers draw a grid instead). */
export function useRadarImage(src: string | null | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}

/**
 * Factor for markers and labels drawn on a 1024px tool canvas so they keep a
 * steady on-screen size: larger when the canvas is shown small (phones),
 * smaller while the map is zoomed in. 1 at ≥ `reference` CSS px wide and 1×.
 */
export function useCanvasUiScale(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  zoom = 1,
  reference = 720,
  max = 2.4
): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // clientWidth ignores the pan/zoom CSS transform; zoom is applied below
    const update = () => setWidth(canvas.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [canvasRef]);

  if (width <= 0) return 1;
  const base = Math.min(max, Math.max(1, reference / width));
  // Let markers grow a little when zoomed, but far less than the map does
  return base / Math.sqrt(zoom);
}
