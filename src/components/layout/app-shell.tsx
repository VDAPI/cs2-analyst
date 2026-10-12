"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileDrawer } from "./mobile-drawer";
import { BottomNav } from "./bottom-nav";

/** Signed-in app frame: sidebar ≥1024px, top bar + drawer below, bottom bar <768px. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onMenu={() => setDrawerOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+24px)] pt-4 animate-page-enter md:p-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
      <BottomNav onMore={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
