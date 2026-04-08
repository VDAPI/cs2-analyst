import { useEffect, useRef, useCallback } from "react";

/**
 * Hook for Canvas-based 2D replay rendering.
 * Returns a ref to attach to a <canvas> element and a draw function.
 */
export function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, frameCount: number) => void
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCountRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      frameCountRef.current += 1;

      // Handle high-DPI displays
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      draw(ctx, frameCountRef.current);
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationId);
  }, [draw]);

  return canvasRef;
}

/**
 * Hook for keyboard shortcuts in the replay viewer.
 */
export function useReplayKeyboard(handlers: {
  onTogglePlay: () => void;
  onNextRound: () => void;
  onPrevRound: () => void;
  onSpeedUp: () => void;
  onSlowDown: () => void;
  onNextTick: () => void;
  onPrevTick: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          handlers.onTogglePlay();
          break;
        case "ArrowRight":
          if (e.shiftKey) handlers.onNextRound();
          else handlers.onNextTick();
          break;
        case "ArrowLeft":
          if (e.shiftKey) handlers.onPrevRound();
          else handlers.onPrevTick();
          break;
        case "+":
        case "=":
          handlers.onSpeedUp();
          break;
        case "-":
          handlers.onSlowDown();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}

/**
 * Hook for debouncing a value (useful for search inputs).
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Need to import useState for useDebounce
import { useState } from "react";
