import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";
import { PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

export type TeamTab = "overview" | "rivals" | "boards" | "settings";

const TABS: Array<{ key: TeamTab; label: MessageKey; path: string }> = [
  { key: "overview", label: "team.tabOverview", path: "" },
  { key: "rivals", label: "team.tabRivals", path: "/rivals" },
  { key: "boards", label: "team.tabBoards", path: "/boards" },
  { key: "settings", label: "team.tabSettings", path: "/settings" },
];

/** Every team screen starts with this: the screen's h1 and the team's tabs. */
export async function TeamHeader({
  team,
  active,
  title,
  description,
  actions,
  back,
}: {
  team: { id: string; name: string; tag: string | null };
  active: TeamTab;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  const { t } = await getT();
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <span>
            {team.tag ? `[${team.tag}] ` : ""}
            {team.name}
          </span>
        }
        title={title}
        description={description}
        actions={actions}
        back={back}
      />
      <nav aria-label={t("team.tabsLabel")} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/team/${team.id}${tab.path}`}
            aria-current={tab.key === active ? "page" : undefined}
            className={cn(
              "flex min-h-10 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors max-md:min-h-11",
              tab.key === active
                ? "bg-[var(--accent-muted)] text-[var(--text-primary)]"
                : "text-[var(--text-tertiary)] hover:bg-[rgba(190,160,255,0.06)] hover:text-[var(--text-secondary)]"
            )}
          >
            {t(tab.label)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
