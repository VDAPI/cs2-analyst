import {
  MapPin,
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
  Target,
  ShieldCheck,
  TrendingUp,
  GraduationCap,
  Dumbbell,
  Swords,
  Clapperboard,
  UserRound,
  CreditCard,
  FolderOpen,
  Sparkles,
  Map as MapIcon,
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
  /** Stable id, used to remember whether the group is open. */
  id: string;
  labelKey: MessageKey;
  icon: LucideIcon;
  items: NavItem[];
}

/** Sidebar categories; each one expands into its screens. Every screen lives in exactly one group. */
export const navGroups: NavGroup[] = [
  {
    id: "matches",
    labelKey: "nav.groupMatches",
    icon: FolderOpen,
    items: [
      { href: "/matches", labelKey: "nav.matches", icon: BarChart3 },
      { href: "/report", labelKey: "nav.report", icon: ClipboardCheck },
      { href: "/upload", labelKey: "nav.upload", shortLabelKey: "nav.uploadShort", icon: Upload },
      { href: "/queue", labelKey: "nav.queue", icon: ListOrdered },
      { href: "/library", labelKey: "nav.library", icon: Library },
      { href: "/premier", labelKey: "nav.premier", icon: Gamepad2 },
    ],
  },
  {
    id: "improve",
    labelKey: "nav.groupImprove",
    icon: Sparkles,
    items: [
      { href: "/progress", labelKey: "nav.progress", icon: TrendingUp },
      { href: "/coach", labelKey: "nav.coach", icon: GraduationCap },
      { href: "/training", labelKey: "nav.training", icon: Dumbbell },
      { href: "/clips", labelKey: "nav.clips", icon: Clapperboard },
    ],
  },
  {
    id: "map",
    labelKey: "nav.groupMap",
    icon: MapIcon,
    items: [
      { href: "/replay", labelKey: "nav.replay", icon: Play },
      { href: "/heatmaps", labelKey: "nav.heatmaps", icon: Flame },
      { href: "/grenades", labelKey: "nav.grenades", icon: Crosshair },
      { href: "/lineups", labelKey: "nav.lineups", icon: Target },
      { href: "/economy", labelKey: "nav.economy", icon: DollarSign },
    ],
  },
  {
    id: "players",
    labelKey: "nav.groupPlayers",
    icon: Users,
    items: [
      { href: "/players", labelKey: "nav.players", icon: Users },
      { href: "/compare", labelKey: "nav.compare", icon: GitCompare },
      { href: "/friends", labelKey: "nav.friends", icon: UserRound },
    ],
  },
  {
    id: "team",
    labelKey: "nav.groupTeam",
    icon: Shield,
    items: [
      { href: "/team", labelKey: "nav.team", icon: Shield },
      { href: "/team-analysis", labelKey: "nav.teamAnalysis", icon: FolderOpen },
      { href: "/callouts", labelKey: "nav.callouts", icon: MapPin },
      { href: "/scouting", labelKey: "nav.scouting", icon: Binoculars },
    ],
  },
  {
    id: "pro",
    labelKey: "nav.groupPro",
    icon: Trophy,
    items: [
      { href: "/pro", labelKey: "nav.pro", icon: Trophy },
      { href: "/play-like-pro", labelKey: "nav.playLikePro", icon: Swords },
      { href: "/billing", labelKey: "nav.billing", icon: CreditCard },
    ],
  },
];

export const settingsItem: NavItem = { href: "/settings", labelKey: "nav.settings", icon: Settings };

/** Shown next to Settings for admins only (S27). */
export const adminItem: NavItem = { href: "/admin", labelKey: "nav.admin", icon: ShieldCheck };

/** The four destinations pinned to the mobile bottom bar; the rest live under "Więcej". */
export const mobilePrimaryHrefs = ["/matches", "/report", "/upload", "/replay"];

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The group holding the current screen, if any. */
export function activeGroupId(pathname: string): string | undefined {
  return navGroups.find((g) => g.items.some((i) => isActivePath(pathname, i.href)))?.id;
}
