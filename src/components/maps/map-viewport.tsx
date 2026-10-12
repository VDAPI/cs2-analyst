"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const TAP_SLOP_PX = 8;
const DOUBLE_TAP_MS = 300;

interface View {
  scale: number;
  tx: number;
  ty: number;
}

interface MapViewportProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Internal canvas resolution (width = height). */
  size: number;
  /** Tap/click without dragging, in canvas pixel coordinates. */
  onTap?: (point: { x: number; y: number }) => void;
  /** Overlays drawn above the map that don't zoom (legend, round badge …). */
  children?: ReactNode;
  label: string;
  className?: string;
  /** Current zoom (1–4), for keeping markers a steady size. */
  onZoomChange?: (scale: number) => void;
}

/**
 * Square map canvas with touch-first pan and zoom: pinch or ⌘/Ctrl+wheel to
 * zoom, drag to pan while zoomed, double-tap to reset, +/− buttons for
 * everyone. At 1× vertical swipes still scroll the page (`touch-action: pan-y`).
 */
export function MapViewport({ canvasRef, size, onTap, children, label, className, onZoomChange }: MapViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    onZoomChange?.(view.scale);
  }, [view.scale, onZoomChange]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, startX: 0, startY: 0, pinchDist: 0, midX: 0, midY: 0 });
  const lastTap = useRef(0);

  const clampView = useCallback((v: View): View => {
    const el = containerRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale));
    return {
      scale,
      tx: Math.min(0, Math.max(w - w * scale, v.tx)),
      ty: Math.min(0, Math.max(h - h * scale, v.ty)),
    };
  }, []);

  /** Zoom by `factor` keeping the container-relative point (cx, cy) fixed. */
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      setView((v) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const k = scale / v.scale;
        return clampView({ scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k });
      });
    },
    [clampView]
  );

  const zoomCenter = (factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  };

  const reset = () => setView({ scale: 1, tx: 0, ty: 0 });

  // ⌘/Ctrl + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const local = (e: React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.moved = false;
      g.startX = p.x;
      g.startY = p.y;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      g.midX = (a.x + b.x) / 2;
      g.midY = (a.y + b.y) / 2;
      g.moved = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      if (g.pinchDist > 0) {
        setView((v) => {
          const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (v.scale * dist) / g.pinchDist));
          const k = scale / v.scale;
          return clampView({
            scale,
            tx: midX - (g.midX - v.tx) * k,
            ty: midY - (g.midY - v.ty) * k,
          });
        });
      }
      g.pinchDist = dist;
      g.midX = midX;
      g.midY = midY;
      return;
    }

    if (Math.hypot(p.x - g.startX, p.y - g.startY) > TAP_SLOP_PX) g.moved = true;
    if (viewRef.current.scale > 1) {
      setView((v) => clampView({ ...v, tx: v.tx + p.x - prev.x, ty: v.ty + p.y - prev.y }));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0 || g.moved) {
      if (pointers.current.size === 0) g.moved = false;
      return;
    }

    const now = performance.now();
    if (now - lastTap.current < DOUBLE_TAP_MS && viewRef.current.scale > 1) {
      lastTap.current = 0;
      reset();
      return;
    }
    lastTap.current = now;

    const canvas = canvasRef.current;
    if (!canvas || !onTap) return;
    const rect = canvas.getBoundingClientRect();
    onTap({
      x: ((e.clientX - rect.left) / rect.width) * size,
      y: ((e.clientY - rect.top) / rect.height) * size,
    });
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    gesture.current.moved = false;
  };

  const zoomed = view.scale > 1.001;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      className={cn(
        "relative aspect-square w-full select-none overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--canvas)] shadow-[var(--shadow-md)]",
        zoomed ? "cursor-grab active:cursor-grabbing" : onTap ? "cursor-pointer" : "",
        className
      )}
      style={{ touchAction: zoomed ? "none" : "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div
        className="h-full w-full origin-top-left"
        style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}
      >
        <canvas ref={canvasRef} width={size} height={size} className="block h-full w-full" />
      </div>

      {children}

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <ZoomButton label="Przybliż" onClick={() => zoomCenter(1.5)} disabled={view.scale >= MAX_SCALE}>
          <Plus className="h-4 w-4" />
        </ZoomButton>
        <ZoomButton label="Oddal" onClick={() => zoomCenter(1 / 1.5)} disabled={!zoomed}>
          <Minus className="h-4 w-4" />
        </ZoomButton>
        {zoomed && (
          <ZoomButton label="Pokaż całą mapę" onClick={reset}>
            <Maximize2 className="h-4 w-4" />
          </ZoomButton>
        )}
      </div>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] backdrop-blur-md transition-colors duration-150 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-glow)] disabled:opacity-40 max-md:h-10 max-md:w-10"
    >
      {children}
    </button>
  );
}
