"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import type { NavItem } from "./nav-items";
import { useT } from "@/lib/i18n/client";

interface NavLinkProps {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function NavLink({ item, active, collapsed, onNavigate }: NavLinkProps) {
  const t = useT();
  const Icon = item.icon;
  const label = t(item.labelKey);
  const base = cn(
    "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 max-lg:min-h-11",
    collapsed && "justify-center px-0"
  );

  if (item.soon) {
    return (
      <span
        aria-disabled
        title={collapsed ? `${label} (${t("common.soon")})` : undefined}
        className={cn(base, "cursor-default text-[var(--text-disabled)]")}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && (
          <>
            <span className="truncate">{label}</span>
            <span className="ml-auto rounded-full bg-[rgba(190,160,255,0.08)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
              {t("common.soon")}
            </span>
          </>
        )}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        base,
        active
          ? "bg-[var(--accent-muted)] font-semibold text-[var(--accent-hover)]"
          : "text-[var(--text-tertiary)] hover:bg-[rgba(190,160,255,0.06)] hover:text-[var(--text-secondary)]"
      )}
    >
      {active && (
        <span aria-hidden className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]" />
      )}
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
