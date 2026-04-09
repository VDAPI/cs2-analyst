"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { Search, Bell, LogOut, Settings, ChevronDown } from "lucide-react";
import { UserAvatar } from "@/components/ui";
import Link from "next/link";

export function Topbar() {
  const { data: session } = useSession();
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
    <header className="glass sticky top-0 z-50 flex h-[var(--topbar-height)] items-center justify-between border-b border-[var(--border)] px-6">
      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5">
        <Search className="h-4 w-4 text-[var(--text-disabled)]" />
        <input
          type="text"
          placeholder="Search matches, players..."
          className="w-64 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none"
        />
        <kbd className="rounded border border-[var(--border)] bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
          ⌘K
        </kbd>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        <button className="relative rounded-lg p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-secondary)]">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--accent)]" />
        </button>

        {/* User dropdown */}
        {session?.user && (
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
            >
              <UserAvatar
                name={session.user.name ?? "?"}
                image={session.user.image}
                size="sm"
              />
              <span className="text-sm text-[var(--text-secondary)]">
                {session.user.name}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-[var(--text-tertiary)] transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-1 shadow-xl animate-scale-in">
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <div className="my-1 border-t border-[var(--border)]" />
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
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
