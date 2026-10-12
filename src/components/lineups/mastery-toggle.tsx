"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, GraduationCap } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/** Marks a lineup as mastered (or back to practice) for the signed-in player (S22). */
export function MasteryToggle({ map, lineupKey, initial }: { map: string; lineupKey: string; initial: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [mastered, setMastered] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !mastered;
    setMastered(next);
    setSaving(true);
    const res = await fetch("/api/lineups/mastery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ map, key: lineupKey, mastered: next }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setMastered(!next);
      toast({ title: t("lineups.masteryFailed"), variant: "error" });
      return;
    }
    toast({ title: t(next ? "lineups.masteredSaved" : "lineups.masteredRemoved"), variant: "success" });
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant={mastered ? "secondary" : "ghost"}
      size="sm"
      onClick={toggle}
      disabled={saving}
      aria-pressed={mastered}
      className={mastered ? "border-[var(--good)] text-[var(--good)]" : undefined}
    >
      {mastered ? <Check className="h-3.5 w-3.5" aria-hidden /> : <GraduationCap className="h-3.5 w-3.5" aria-hidden />}
      {t(mastered ? "lineups.unmarkMastered" : "lineups.markMastered")}
    </Button>
  );
}
