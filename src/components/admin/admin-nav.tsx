"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { href: "/admin", label: "Przegląd" },
  { href: "/admin/analyses", label: "Analizy" },
  { href: "/admin/users", label: "Użytkownicy" },
  { href: "/admin/pro", label: "Dane pro" },
  { href: "/admin/ml", label: "Model ML" },
];

/** Sub-navigation of the admin panel; scrolls sideways on its own at 360 px. */
export function AdminNav({ failed }: { failed?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Panel admina" className="-mx-1 overflow-x-auto px-1">
      <div className="flex w-max gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-1">
        {TABS.map((t) => {
          const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--accent-muted)] text-[var(--accent-hover)]"
                  : "text-[var(--text-secondary)] hover:bg-[rgba(190,160,255,0.06)] hover:text-[var(--text-primary)]"
              )}
            >
              {t.label}
              {t.href === "/admin/analyses" && failed ? (
                <span className="rounded-full bg-[var(--mistake-muted)] px-1.5 font-mono text-xs tabular-nums text-[var(--mistake)]">
                  {failed}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
