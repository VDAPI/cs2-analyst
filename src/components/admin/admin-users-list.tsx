"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, ShieldCheck, Users } from "lucide-react";
import { Badge, Button, Card, Checkbox, EmptyState, Input, useToast } from "@/components/ui";
import { formatDate } from "@/lib/utils/formatters";
import type { AdminUserRow } from "@/lib/admin/data";
import type { Plan } from "@prisma/client";

const PLANS: Plan[] = ["FREE", "PRO", "TEAM"];

function UserEditor({
  user,
  isSelf,
  planLimits,
  onDone,
}: {
  user: AdminUserRow;
  isSelf: boolean;
  planLimits: Record<Plan, string>;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [plan, setPlan] = useState<Plan>(user.plan);
  const [limit, setLimit] = useState(user.monthlyDemoLimit == null ? "" : String(user.monthlyDemoLimit));
  const [admin, setAdmin] = useState(user.role === "ADMIN");
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = limit.trim();
    const parsedLimit = trimmed === "" ? null : Number(trimmed);
    if (parsedLimit !== null && (!Number.isInteger(parsedLimit) || parsedLimit < 0)) {
      toast({ title: "Limit musi być liczbą całkowitą ≥ 0 albo pusty", variant: "warning" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, monthlyDemoLimit: parsedLimit, role: admin ? "ADMIN" : "USER" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Nie udało się zapisać", description: data.error, variant: "error" });
        return;
      }
      toast({ title: "Zapisano", variant: "success" });
      onDone();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 grid gap-3 border-t border-[var(--divider)] pt-3 sm:grid-cols-[auto_minmax(0,12rem)_auto] sm:items-end">
      <label className="flex flex-col gap-1 text-xs text-[var(--text-tertiary)]">
        Plan
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as Plan)}
          className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none md:h-10"
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p} ({planLimits[p]}/mies.)
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--text-tertiary)]">
        Własny limit dem / mies.
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder={`z planu: ${planLimits[plan]}`}
          className="font-mono"
        />
      </label>
      <Checkbox
        id={`admin-${user.id}`}
        checked={admin}
        disabled={isSelf}
        onChange={(e) => setAdmin(e.target.checked)}
        label="Administrator"
        className="sm:h-10"
      />
      <div className="flex gap-2 sm:col-span-3">
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Zapisz
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={saving}>
          Anuluj
        </Button>
      </div>
    </div>
  );
}

/** Every player with plan, usage this month and an inline editor for plan, limit and role. */
export function AdminUsersList({
  users,
  selfId,
  planLimits,
}: {
  users: AdminUserRow[];
  selfId: string;
  planLimits: Record<Plan, string>;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  if (users.length === 0) {
    return <EmptyState icon={Users} title="Brak użytkowników" description="Zmień wyszukiwanie." />;
  }

  return (
    <div className="space-y-3">
      {users.map((u) => {
        const limit = u.effectiveLimit;
        const pct = limit != null && limit > 0 ? Math.min(100, (u.usedThisMonth / limit) * 100) : limit === 0 ? 100 : 0;
        const atLimit = limit != null && u.usedThisMonth >= limit;
        return (
          <Card key={u.id} className="p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="break-all font-semibold text-[var(--text-primary)]">{u.label}</p>
                  <Badge variant={u.plan === "FREE" ? "neutral" : "lime"}>{u.plan}</Badge>
                  {u.role === "ADMIN" && (
                    <Badge variant="default">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                      Admin
                    </Badge>
                  )}
                  {u.monthlyDemoLimit != null && <Badge variant="warning">Własny limit</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  {u.faceitNickname && u.faceitNickname !== u.label && <>FACEIT {u.faceitNickname} · </>}
                  {u.steamLinked && <>Steam · </>}
                  od <span className="font-mono tabular-nums">{formatDate(u.createdAt)}</span>
                  <span aria-hidden> · </span>
                  analiz <span className="font-mono tabular-nums">{u.totalAnalyses}</span>
                  {u.failedAnalyses > 0 && (
                    <>
                      {", "}
                      <Link
                        href="/admin/analyses?filter=failed"
                        className="text-[var(--mistake)] hover:underline"
                      >
                        nieudanych <span className="font-mono tabular-nums">{u.failedAnalyses}</span>
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 sm:w-64">
                <div className="min-w-0 flex-1">
                  <p className="flex justify-between text-xs text-[var(--text-tertiary)]">
                    <span>Ten miesiąc</span>
                    <span
                      className={`font-mono tabular-nums ${atLimit ? "text-[var(--mistake)]" : "text-[var(--text-secondary)]"}`}
                    >
                      {u.usedThisMonth}/{limit ?? "∞"}
                    </span>
                  </p>
                  {limit != null && (
                    <div
                      role="meter"
                      aria-label="Wykorzystanie limitu"
                      aria-valuemin={0}
                      aria-valuemax={limit}
                      aria-valuenow={u.usedThisMonth}
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-4)]"
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: atLimit ? "var(--mistake)" : "var(--accent)" }}
                      />
                    </div>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={`Edytuj ${u.label}`}
                  aria-expanded={editing === u.id}
                  onClick={() => setEditing(editing === u.id ? null : u.id)}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
            {editing === u.id && (
              <UserEditor
                user={u}
                isSelf={u.id === selfId}
                planLimits={planLimits}
                onDone={() => setEditing(null)}
              />
            )}
          </Card>
        );
      })}
    </div>
  );
}
