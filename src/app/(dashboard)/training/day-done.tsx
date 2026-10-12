"use client";

import { useState } from "react";
import { Checkbox, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/** Ticks the routine's day off in the weekly plan (same flag as on /coach). */
export function DayDone({ planId, day, initial }: { planId: string; day: number; initial: boolean }) {
  const t = useT();
  const toast = useToast();
  const [done, setDone] = useState(initial);

  async function toggle(value: boolean) {
    setDone(value);
    const res = await fetch("/api/coach/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, day, done: value }),
    }).catch(() => null);
    if (!res?.ok) {
      setDone(!value);
      toast({ title: t("common.error"), variant: "error" });
    }
  }

  return <Checkbox id={`routine-day-${day}`} checked={done} onChange={(e) => toggle(e.target.checked)} label={t("training.dayDone")} />;
}
