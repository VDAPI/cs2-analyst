"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Logo } from "./logo";
import { NavGroups } from "./nav-groups";
import { NavLink } from "./nav-link";
import { settingsItem, isActivePath } from "./nav-items";
import { useT } from "@/lib/i18n/client";

const STORAGE_KEY = "cs2a:sidebar-collapsed";

/** Desktop sidebar (≥1024px). Below that the top bar drawer and mobile bottom bar take over. */
export function Sidebar() {
  const pathname = usePathname();
  const t = useT();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // storage unavailable — keep expanded
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-1)] transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[var(--sidebar-collapsed)]" : "w-[var(--sidebar-width)]"
      )}
    >
      <div
        className={cn(
          "flex h-[var(--topbar-height)] shrink-0 items-center border-b border-[var(--border)]",
          collapsed ? "justify-center px-0" : "px-5"
        )}
      >
        <Logo compact={collapsed} />
      </div>

      <nav aria-label={t("nav.mainNav")} className="flex-1 overflow-y-auto p-3">
        <NavGroups collapsed={collapsed} />
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-[var(--border)] p-3">
        <NavLink item={settingsItem} active={isActivePath(pathname, settingsItem.href)} collapsed={collapsed} />
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? t("nav.expandMenu") : t("nav.collapseMenu")}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(190,160,255,0.06)] hover:text-[var(--text-secondary)]",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!collapsed && t("nav.collapse")}
        </button>
      </div>
    </aside>
  );
}
