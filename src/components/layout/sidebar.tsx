"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Upload,
  Users,
  Map,
  DollarSign,
  Crosshair,
  Play,
  GitCompare,
  Settings,
  Flame,
} from "lucide-react";

const navItems = [
  { href: "/matches", label: "Matches", icon: BarChart3 },
  { href: "/upload", label: "Upload Demo", icon: Upload },
  { href: "/players", label: "Players", icon: Users },
  { href: "/heatmaps", label: "Heatmaps", icon: Flame },
  { href: "/economy", label: "Economy", icon: DollarSign },
  { href: "/grenades", label: "Grenades", icon: Crosshair },
  { href: "/replay", label: "2D Replay", icon: Play },
  { href: "/compare", label: "Compare", icon: GitCompare },
];

const bottomItems = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[var(--sidebar-width)] flex-col border-r border-[var(--border)] bg-[var(--surface-1)]">
      {/* Logo */}
      <Link
        href="/matches"
        className="flex h-[var(--topbar-height)] items-center gap-2.5 border-b border-[var(--border)] px-5 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]">
          <Crosshair className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          CS2 Analyst
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-150 ${
                isActive
                  ? "bg-[rgba(59,130,246,0.15)] text-[#60a5fa] shadow-[inset_0_0_12px_rgba(59,130,246,0.08)]"
                  : "text-[var(--text-tertiary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <Icon className={`h-[18px] w-[18px] transition-colors duration-150 ${isActive ? "text-[#60a5fa]" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-[var(--border)] p-3">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-secondary)]"
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
