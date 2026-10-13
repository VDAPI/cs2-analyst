"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { SIDE_ROLES, type Role } from "@/lib/roles/roles";
import { roleKey } from "@/lib/roles/view";

type Side = "T" | "CT";

export interface RoleCorrectionSide {
  side: Side;
  /** The role set by hand on this match, or null (automatic). */
  match: Role | null;
  /** What "automatic" means here: the usual role when one is set, else the detected one. */
  auto: Role | null;
}

/**
 * "Correct your role" (S31): a role per side for this match, optionally
 * remembered as the player's usual role. The findings are rebuilt with it.
 */
export function RoleCorrection({ matchId, steamId, sides }: { matchId: string; steamId: string; sides: RoleCorrectionSide[] }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [values, setValues] = useState<Record<Side, string>>(() => ({
    T: sides.find((s) => s.side === "T")?.match ?? "",
    CT: sides.find((s) => s.side === "CT")?.match ?? "",
  }));
  const [remember, setRemember] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      for (const s of sides) {
        const role = values[s.side] || null;
        if (role === s.match && !remember) continue;
        const res = await fetch(`/api/matches/${matchId}/role`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steamId, side: s.side, role, remember }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          toast({ title: t("roles.correct.failed"), description: data.error, variant: "error" });
          return;
        }
      }
      toast({ title: t("roles.correct.saved"), variant: "success" });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] p-3" data-testid="role-correction">
      <div className="space-y-1">
        <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{t("roles.correct.title")}</h3>
        <p className="text-sm text-[var(--text-secondary)]">{t("roles.correct.hint")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {sides.map((s) => (
          <label key={s.side} className="flex min-w-0 flex-col gap-1 text-sm text-[var(--text-secondary)]">
            <span className="label-overline" style={{ color: s.side === "T" ? "var(--t-gold)" : "var(--ct-blue)" }}>
              {s.side}
            </span>
            <select
              value={values[s.side]}
              onChange={(e) => setValues((v) => ({ ...v, [s.side]: e.target.value }))}
              className="h-10 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none max-md:min-h-11"
            >
              <option value="">
                {s.auto ? t("roles.correct.auto", { role: t(roleKey(s.auto)) }) : t("roles.correct.autoNone")}
              </option>
              {SIDE_ROLES[s.side].map((r) => (
                <option key={r} value={r}>
                  {t(roleKey(r))}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Checkbox
          id={`role-remember-${steamId}`}
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          label={t("roles.correct.remember")}
        />
        <Button variant="secondary" size="sm" onClick={save} disabled={saving}>
          {t("roles.correct.save")}
        </Button>
      </div>
    </div>
  );
}
