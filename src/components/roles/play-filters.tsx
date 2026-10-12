"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { ControlGroup, Segmented, ToolSelect } from "@/components/tools/segmented";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils/cn";

interface Option {
  value: string;
  label: string;
}

/**
 * Pro, map and side pickers of /play-like-pro (S24); each change replaces the
 * URL (the page is a Server Component). The star saves the pro as favourite.
 */
export function PlayFilters({
  pro,
  map,
  side,
  pros,
  maps,
  favorite,
}: {
  pro: string;
  map: string;
  side: "CT" | "T";
  pros: Option[];
  maps: Option[];
  favorite: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    if (key === "pro") next.delete("map");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  async function saveFavorite() {
    setSaving(true);
    try {
      const res = await fetch("/api/user/favorite-pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steamId: pro }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast({ title: t("roles.favoriteSaved"), variant: "success" });
      router.refresh();
    } catch {
      toast({ title: t("roles.favoriteFailed"), variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]", pending && "opacity-60")}>
      <ControlGroup label={t("roles.pickPro")} className="sm:col-span-2 lg:col-span-1">
        <div className="flex min-w-0 gap-2">
          <ToolSelect value={pro} onChange={(e) => set("pro", e.target.value)} aria-label={t("roles.pickPro")}>
            {pros.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </ToolSelect>
          <Button
            type="button"
            variant={favorite ? "secondary" : "ghost"}
            size="sm"
            onClick={saveFavorite}
            disabled={favorite || saving}
            aria-pressed={favorite}
            title={favorite ? t("roles.favorite") : t("roles.setFavorite")}
            className="h-9 shrink-0 max-md:h-11"
          >
            <Star
              className={cn("h-4 w-4", favorite ? "fill-[var(--accent-2)] text-[var(--accent-2)]" : "text-[var(--text-secondary)]")}
              aria-hidden
            />
            <span className="sr-only sm:not-sr-only">{favorite ? t("roles.favorite") : t("roles.setFavorite")}</span>
          </Button>
        </div>
      </ControlGroup>
      <ControlGroup label={t("roles.map")}>
        <ToolSelect value={map} onChange={(e) => set("map", e.target.value)} aria-label={t("roles.map")}>
          {maps.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </ToolSelect>
      </ControlGroup>
      <ControlGroup label={t("roles.side")}>
        <Segmented
          label={t("roles.side")}
          value={side}
          onChange={(v) => set("side", v)}
          options={[
            { value: "T", label: "T", tone: "t" },
            { value: "CT", label: "CT", tone: "ct" },
          ]}
        />
      </ControlGroup>
    </div>
  );
}
