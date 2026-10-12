import {
  BarChart3,
  Upload,
  Users,
  DollarSign,
  Crosshair,
  Play,
  GitCompare,
  Settings,
  Flame,
  Trophy,
  Shield,
  ListOrdered,
  Library,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Planned screen that does not exist yet — shown, but not clickable. */
  soon?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Analiza",
    items: [
      { href: "/matches", label: "Mecze", icon: BarChart3 },
      { href: "/report", label: "Raport", icon: ClipboardCheck },
      { href: "/upload", label: "Wgraj demo", icon: Upload },
      { href: "/queue", label: "Kolejka analiz", icon: ListOrdered },
      { href: "/library", label: "Biblioteka", icon: Library },
      { href: "/players", label: "Gracze", icon: Users },
      { href: "/compare", label: "Porównanie", icon: GitCompare },
    ],
  },
  {
    label: "Narzędzia",
    items: [
      { href: "/replay", label: "Replay 2D", icon: Play },
      { href: "/heatmaps", label: "Heatmapy", icon: Flame },
      { href: "/grenades", label: "Granaty", icon: Crosshair },
      { href: "/economy", label: "Ekonomia", icon: DollarSign },
    ],
  },
  {
    label: "Pro i drużyna",
    items: [
      { href: "/pro", label: "Pro", icon: Trophy, soon: true },
      { href: "/team", label: "Drużyna", icon: Shield, soon: true },
    ],
  },
];

export const settingsItem: NavItem = { href: "/settings", label: "Ustawienia", icon: Settings };

/** The four destinations pinned to the mobile bottom bar; the rest live under "Więcej". */
export const mobilePrimaryHrefs = ["/matches", "/report", "/upload", "/replay"];

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
