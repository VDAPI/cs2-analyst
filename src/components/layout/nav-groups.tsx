"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { NavLink } from "./nav-link";
import { navGroups, isActivePath } from "./nav-items";
import { useT } from "@/lib/i18n/client";

export function NavGroups({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <div className="flex flex-col gap-5">
      {navGroups.map((group) => (
        <div key={group.labelKey}>
          {collapsed ? (
            <div aria-hidden className="mx-3 mb-2 h-px bg-[var(--divider)]" />
          ) : (
            <p className="label-overline mb-1.5 px-3 text-[var(--text-tertiary)]">{t(group.labelKey)}</p>
          )}
          <div className={cn("flex flex-col gap-0.5")}>
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActivePath(pathname, item.href)}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
