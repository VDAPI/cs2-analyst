"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { navGroups, mobilePrimaryHrefs, isActivePath, type NavItem } from "./nav-items";

const allItems: NavItem[] = navGroups.flatMap((g) => g.items);
const primaryItems = mobilePrimaryHrefs
  .map((href) => allItems.find((i) => i.href === href))
  .filter((i): i is NavItem => Boolean(i));

/** Mobile (<768px) bottom bar: four main destinations plus "Więcej" for the drawer. */
export function BottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const moreActive = !primaryItems.some((i) => isActivePath(pathname, i.href));

  return (
    <nav
      aria-label="Nawigacja dolna"
      className="glass fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] pb-safe md:hidden"
    >
      <ul className="grid h-[var(--bottom-nav-height)] grid-cols-5">
        {primaryItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                  active ? "text-[var(--accent-hover)]" : "text-[var(--text-tertiary)]"
                )}
              >
                {active && (
                  <span aria-hidden className="absolute top-0 h-[2px] w-8 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]" />
                )}
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate px-1">{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <button
            type="button"
            onClick={onMore}
            className={cn(
              "flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
              moreActive ? "text-[var(--accent-hover)]" : "text-[var(--text-tertiary)]"
            )}
          >
            <Menu className="h-5 w-5" />
            Więcej
          </button>
        </li>
      </ul>
    </nav>
  );
}
