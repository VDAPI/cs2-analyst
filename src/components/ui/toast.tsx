"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XOctagon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type ToastVariant = "info" | "success" | "warning" | "error";

interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms; 0 keeps the toast until dismissed. */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, "description">> {
  id: number;
  description?: string;
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

const variantStyles: Record<ToastVariant, { bar: string; icon: typeof Info; iconClass: string }> = {
  info: { bar: "bg-[var(--accent)]", icon: Info, iconClass: "text-[var(--accent)]" },
  success: { bar: "bg-[var(--good)]", icon: CheckCircle2, iconClass: "text-[var(--good)]" },
  warning: { bar: "bg-[var(--warning)]", icon: AlertTriangle, iconClass: "text-[var(--warning)]" },
  error: { bar: "bg-[var(--mistake)]", icon: XOctagon, iconClass: "text-[var(--mistake)]" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setToasts((prev) => [
      ...prev.slice(-2),
      { id, variant: "info", duration: 5000, ...options },
    ]);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+12px)] z-[100] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:bottom-6 md:right-6 md:items-end md:px-0"
      >
        {toasts.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const style = variantStyles[item.variant];
  const Icon = style.icon;

  useEffect(() => {
    if (item.duration <= 0) return;
    const timer = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [item.id, item.duration, onDismiss]);

  return (
    <div
      role={item.variant === "error" ? "alert" : "status"}
      className="pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-lg border border-[var(--border-hover)] bg-[var(--surface-2)] py-3 pl-4 pr-2 shadow-[var(--shadow-md)] animate-slide-up"
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", style.bar)} />
      <Icon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconClass)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Zamknij"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(190,160,255,0.08)] hover:text-[var(--text-primary)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** `const toast = useToast(); toast({ title: "Analiza gotowa", variant: "success" })` */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
