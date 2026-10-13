"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, Target, Trash2 } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import { formatProgressValue } from "@/lib/progress/format";
import type { GoalStatus } from "@/lib/progress/goals";
import { useT } from "@/lib/i18n/client";
import { formatDate } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import { metricLabel } from "@/lib/progress/labels";

export interface GoalMetricOption {
  key: string;
  unit: string;
  decimals: number;
  direction: "lower" | "higher";
  /** Default target. */
  goal: number | null;
}

const selectClass =
  "h-10 min-w-0 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)] focus:outline-none max-md:min-h-11";

const op = (o: GoalMetricOption) => (o.direction === "lower" ? "≤" : "≥");

export function GoalsPanel({
  goals,
  suggestions,
  options,
  window,
  maxGoals,
}: {
  goals: GoalStatus[];
  suggestions: Array<{ metric: string; target: number; current: number | null }>;
  options: GoalMetricOption[];
  window: number;
  maxGoals: number;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const firstFree = options.find((o) => !goals.some((g) => g.metric === o.key)) ?? options[0];
  const [metric, setMetric] = useState(firstFree?.key ?? "");
  const [target, setTarget] = useState(firstFree?.goal != null ? String(firstFree.goal) : "");
  const optionOf = (key: string) => options.find((o) => o.key === key);
  const full = goals.length >= maxGoals;

  async function save(m: string, value: number) {
    setBusy(`save:${m}`);
    try {
      const res = await fetch("/api/progress/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric: m, target: value }),
      });
      if (res.status === 409) toast({ title: t("progress.goalLimit", { n: maxGoals }), variant: "error" });
      else if (!res.ok) toast({ title: t("progress.goalInvalid"), variant: "error" });
      else {
        toast({ title: t("progress.goalSaved"), variant: "success" });
        setAdding(false);
        router.refresh();
      }
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(`del:${id}`);
    try {
      const res = await fetch(`/api/progress/goals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: t("progress.goalRemoved"), variant: "success" });
      router.refresh();
    } catch {
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {goals.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-sm text-[var(--text-tertiary)]">
          {t("progress.goalsEmpty")}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const o = optionOf(g.metric);
            if (!o) return null;
            return (
              <li
                key={g.id}
                className={cn(
                  "min-w-0 rounded-xl border p-3",
                  g.met ? "border-[rgba(61,245,160,0.35)] bg-[var(--good-muted)]" : "border-[var(--border)] bg-[var(--surface-1)]"
                )}
              >
                <div className="flex items-start gap-2">
                  {g.met ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--good)]" aria-hidden />
                  ) : (
                    <Target className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                  )}
                  <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">{metricLabel(t, g.metric)}</p>
                  <span className={cn("shrink-0 text-xs font-semibold", g.met ? "text-[var(--good)]" : "text-[var(--text-tertiary)]")}>
                    {t(g.met ? "progress.goalMet" : "progress.goalOpen")}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(g.id)}
                    disabled={busy === `del:${g.id}`}
                    aria-label={t("progress.goalRemove")}
                    className="-m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-3)] hover:text-[var(--mistake)] disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-[var(--text-tertiary)]">
                    {t("progress.goalNow")}{" "}
                    <span className="font-mono font-semibold text-[var(--text-primary)]">{formatProgressValue(o, g.current)}</span>
                  </span>
                  <span className="text-[var(--text-tertiary)]">
                    {t("progress.goalTarget")}{" "}
                    <span className="font-mono font-semibold text-[var(--accent-2)]">
                      {op(o)} {formatProgressValue(o, g.target)}
                    </span>
                  </span>
                </div>
                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
                  <span
                    className={cn("block h-full rounded-full", g.met ? "bg-[var(--good)]" : "bg-[var(--accent)]")}
                    style={{ width: `${Math.round(g.progress * 100)}%` }}
                  />
                </span>
                <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                  <span className="font-mono">{t("progress.goalHits", { hits: g.hits, n: g.counted })}</span>
                  {g.achievedAt && <> · {t("progress.goalAchievedOn", { date: formatDate(g.achievedAt) })}</>}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {suggestions.length > 0 && !full && (
        <div className="space-y-2">
          <p className="label-overline text-[var(--text-tertiary)]">{t("progress.suggestions")}</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => {
              const o = optionOf(s.metric);
              if (!o) return null;
              return (
                <button
                  key={s.metric}
                  type="button"
                  onClick={() => save(s.metric, s.target)}
                  disabled={busy != null}
                  className="flex min-h-10 max-w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-left text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-active)] hover:text-[var(--text-primary)] disabled:opacity-50"
                >
                  <Plus className="h-4 w-4 shrink-0 text-[var(--accent-2)]" aria-hidden />
                  <span className="min-w-0">
                    {t("progress.suggestionAdd", {
                      label: metricLabel(t, s.metric),
                      op: op(o),
                      value: formatProgressValue(o, s.target),
                    })}
                    <span className="ml-1 font-mono text-xs text-[var(--text-tertiary)]">({formatProgressValue(o, s.current)})</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {adding ? (
        <form
          className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(target.replace(",", "."));
            if (!metric || !Number.isFinite(v) || target.trim() === "") {
              toast({ title: t("progress.goalInvalid"), variant: "error" });
              return;
            }
            save(metric, v);
          }}
        >
          <label className="min-w-0 space-y-1 text-xs text-[var(--text-tertiary)]">
            <span>{t("progress.goalMetric")}</span>
            <select
              className={selectClass}
              value={metric}
              onChange={(e) => {
                setMetric(e.target.value);
                const o = optionOf(e.target.value);
                if (o?.goal != null) setTarget(String(o.goal));
              }}
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {metricLabel(t, o.key)} ({op(o)})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-[var(--text-tertiary)]">
            <span>
              {t("progress.goalValue")}
              {optionOf(metric)?.unit ? ` (${optionOf(metric)?.unit})` : ""}
            </span>
            <Input
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="font-mono"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy != null} className="flex-1 sm:flex-none">
              {t("progress.goalSave")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setAdding(true)}
          disabled={full}
          title={full ? t("progress.goalLimit", { n: maxGoals }) : undefined}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("progress.addGoal")}
        </Button>
      )}
      <p className="text-xs text-[var(--text-tertiary)]">{t("progress.goalsHint", { n: window })}</p>
    </div>
  );
}
