"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ControlGroup, Segmented, ToolSelect } from "@/components/tools/segmented";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils/cn";

interface Option {
  value: string;
  label: string;
}

/** Map, side and rank filters of /pro; each change replaces the URL (the page is a Server Component). */
export function NormFilters({
  map,
  side,
  rank,
  maps,
  ranks,
}: {
  map: string;
  side: "all" | "CT" | "T";
  rank: string;
  maps: Option[];
  ranks: Option[];
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className={cn("grid gap-4 sm:grid-cols-3", pending && "opacity-60")}>
      <ControlGroup label={t("norms.map")}>
        <ToolSelect value={map} onChange={(e) => set("map", e.target.value)} aria-label={t("norms.map")}>
          {maps.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </ToolSelect>
      </ControlGroup>
      <ControlGroup label={t("norms.side")}>
        <Segmented
          label={t("norms.side")}
          value={side}
          onChange={(v) => set("side", v)}
          options={[
            { value: "all", label: t("norms.sideAll") },
            { value: "CT", label: "CT", tone: "ct" },
            { value: "T", label: "T", tone: "t" },
          ]}
        />
      </ControlGroup>
      <ControlGroup label={t("norms.rank")}>
        <ToolSelect value={rank} onChange={(e) => set("rank", e.target.value)} aria-label={t("norms.rank")}>
          {ranks.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </ToolSelect>
      </ControlGroup>
    </div>
  );
}
