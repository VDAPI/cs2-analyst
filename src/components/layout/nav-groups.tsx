"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { NavLink } from "./nav-link";
import { navGroups, isActivePath, activeGroupId, type NavGroup } from "./nav-items";
import { useT } from "@/lib/i18n/client";

const STORAGE_KEY = "cs2a:nav-open-groups";

type OpenState = Record<string, boolean>;

function readStored(): OpenState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const out: OpenState = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "boolean") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function store(state: OpenState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable — the state just isn't remembered
  }
}

/**
 * Sidebar / drawer navigation: categories that expand into their screens.
 * Open groups are remembered per browser; the current screen's group opens by itself.
 * The collapsed (icon-only) sidebar shows every screen, groups separated by a line.
 */
export function NavGroups({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();
  const currentGroup = activeGroupId(pathname);
  const [open, setOpen] = useState<OpenState>(() => (currentGroup ? { [currentGroup]: true } : {}));

  // Stored state (client only) plus the current screen's group, re-opened on every navigation.
  useEffect(() => {
    setOpen((prev) => {
      const next = { ...readStored(), ...prev };
      if (currentGroup) next[currentGroup] = true;
      store(next);
      return next;
    });
  }, [currentGroup]);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      store(next);
      return next;
    });
  }

  if (collapsed) {
    return (
      <div className="flex flex-col gap-3">
        {navGroups.map((group, i) => (
          <div key={group.id}>
            {i > 0 && <div aria-hidden className="mx-3 mb-3 h-px bg-[var(--divider)]" />}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActivePath(pathname, item.href)}
                  collapsed
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {navGroups.map((group) => (
        <NavCategory
          key={group.id}
          group={group}
          open={!!open[group.id]}
          containsActive={group.id === currentGroup}
          onToggle={() => toggle(group.id)}
          pathname={pathname}
          onNavigate={onNavigate}
          label={t(group.labelKey)}
          toggleLabel={t(open[group.id] ? "nav.collapseGroup" : "nav.expandGroup", { group: t(group.labelKey) })}
        />
      ))}
    </div>
  );
}

interface NavCategoryProps {
  group: NavGroup;
  open: boolean;
  containsActive: boolean;
  onToggle: () => void;
  pathname: string;
  onNavigate?: () => void;
  label: string;
  toggleLabel: string;
}

function NavCategory({ group, open, containsActive, onToggle, pathname, onNavigate, label, toggleLabel }: NavCategoryProps) {
  const Icon = group.icon;
  const panelId = `nav-group-${group.id}`;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        title={toggleLabel}
        className={cn(
          "group/cat flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors duration-150 max-lg:min-h-11",
          containsActive
            ? "text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[rgba(190,160,255,0.06)] hover:text-[var(--text-primary)]"
        )}
      >
        <Icon
          className={cn(
            "h-[18px] w-[18px] shrink-0",
            containsActive ? "text-[var(--accent-2)]" : "text-[var(--text-tertiary)] group-hover/cat:text-[var(--text-secondary)]"
          )}
        />
        <span className="truncate font-display">{label}</span>
        {containsActive && !open && (
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-2)] shadow-[0_0_6px_var(--accent-2)]" />
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
      </button>
      <div
        id={panelId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-[21px] mt-0.5 mb-1.5 flex flex-col gap-0.5 border-l border-[var(--border)] pl-2">
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActivePath(pathname, item.href)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
