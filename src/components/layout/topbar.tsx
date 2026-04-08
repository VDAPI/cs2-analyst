"use client";

import { Search, Bell } from "lucide-react";

export function Topbar() {
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

        {/* User avatar placeholder */}
        <button className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-[var(--surface-3)]" />
        </button>
      </div>
    </header>
  );
}
