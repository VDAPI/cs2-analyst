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
  Gamepad2,
  Binoculars,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n/translate";

export interface NavItem {
  href: string;
  /** Translation key of the label (src/lib/i18n/messages). */
  labelKey: MessageKey;
  /** Shorter label for the mobile bottom bar. */
  shortLabelKey?: MessageKey;
  icon: LucideIcon;
  /** Planned screen that does not exist yet — shown, but not clickable. */
  soon?: boolean;
}

export interface NavGroup {
  labelKey: MessageKey;
  /** Shorter label for the mobile bottom bar. */
  shortLabelKey?: MessageKey;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    labelKey: "nav.groupAnalysis",
    items: [
      { href: "/matches", labelKey: "nav.matches", icon: BarChart3 },
      { href: "/report", labelKey: "nav.report", icon: ClipboardCheck },
      { href: "/upload", labelKey: "nav.upload", shortLabelKey: "nav.uploadShort", icon: Upload },
      { href: "/queue", labelKey: "nav.queue", icon: ListOrdered },
      { href: "/library", labelKey: "nav.library", icon: Library },
      { href: "/premier", labelKey: "nav.premier", icon: Gamepad2 },
      { href: "/players", labelKey: "nav.players", icon: Users },
      { href: "/compare", labelKey: "nav.compare", icon: GitCompare },
    ],
  },
  {
    labelKey: "nav.groupTools",
    items: [
      { href: "/replay", labelKey: "nav.replay", icon: Play },
      { href: "/heatmaps", labelKey: "nav.heatmaps", icon: Flame },
      { href: "/grenades", labelKey: "nav.grenades", icon: Crosshair },
      { href: "/economy", labelKey: "nav.economy", icon: DollarSign },
      { href: "/scouting", labelKey: "nav.scouting", icon: Binoculars },
    ],
  },
  {
    labelKey: "nav.groupPro",
    items: [
      { href: "/pro", labelKey: "nav.pro", icon: Trophy, soon: true },
      { href: "/team", labelKey: "nav.team", icon: Shield, soon: true },
    ],
  },
];

export const settingsItem: NavItem = { href: "/settings", labelKey: "nav.settings", icon: Settings };

/** The four destinations pinned to the mobile bottom bar; the rest live under "Więcej". */
export const mobilePrimaryHrefs = ["/matches", "/report", "/upload", "/replay"];

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
