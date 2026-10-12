"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { Search, LogOut, Settings, ChevronDown, Menu } from "lucide-react";
import { UserAvatar } from "@/components/ui";
import Link from "next/link";
import { Logo } from "./logo";
import { useT } from "@/lib/i18n/client";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  const { data: session } = useSession();
  const t = useT();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="glass sticky top-0 z-40 flex h-[var(--topbar-height)] shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-2 md:px-6">
      {/* Mobile / tablet: menu + logo */}
      <div className="flex min-w-0 items-center gap-1 lg:hidden">
        <button
          type="button"
          onClick={onMenu}
          aria-label={t("nav.openMenu")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[rgba(190,160,255,0.06)] hover:text-[var(--text-primary)]"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo />
      </div>

      {/* Search */}
      <div className="hidden min-w-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 py-1.5 transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-glow)] md:flex">
        <Search className="h-4 w-4 shrink-0 text-[var(--text-disabled)]" />
        <input
          type="text"
          placeholder={t("topbar.search")}
          className="w-40 min-w-0 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none xl:w-64"
        />
        <kbd className="hidden rounded border border-[var(--border)] bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)] lg:inline">
          ⌘K
        </kbd>
      </div>

      {/* Right side */}
      <div className="flex shrink-0 items-center gap-1 md:gap-3">
        {session?.user && <NotificationBell />}

        {/* User dropdown */}
        {session?.user && (
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={t("topbar.accountMenu")}
              className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[rgba(190,160,255,0.06)] md:min-h-0"
            >
              <UserAvatar
                name={session.user.name ?? "?"}
                image={session.user.image}
                size="sm"
              />
              <span className="hidden max-w-[160px] truncate text-sm text-[var(--text-secondary)] md:inline">
                {session.user.name}
              </span>
              <ChevronDown className={`hidden h-3.5 w-3.5 text-[var(--text-tertiary)] transition-transform duration-150 md:block ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-[var(--border-hover)] bg-[var(--surface-2)] p-1 shadow-[var(--shadow-md)] animate-scale-in">
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] md:min-h-0"
                >
                  <Settings className="h-4 w-4" />
                  {t("nav.settings")}
                </Link>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm text-[var(--text-secondary)]">{t("topbar.language")}</span>
                  <LanguageSwitcher size="sm" />
                </div>
                <div className="my-1 border-t border-[var(--border)]" />
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] md:min-h-0"
                >
                  <LogOut className="h-4 w-4" />
                  {t("topbar.signOut")}
                </button>
              </div>
            )}
          </div>
        )}

        {!session?.user && (
          <div className="h-8 w-8 rounded-full bg-[var(--surface-3)]" />
        )}
      </div>
    </header>
  );
}
