"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import type { BoardData } from "@/lib/team/board";

/**
 * "Na tablicę": a new tactic board in one of the player's teams with the
 * positions and grenades of a played round (built on the server).
 */
export function PlayToBoard({
  teams,
  map,
  name,
  side,
  data,
}: {
  teams: Array<{ id: string; name: string }>;
  map: string;
  name: string;
  /** Side the analysed team played; the board is our plan, so we take the other one. */
  side: "CT" | "T";
  data: BoardData;
}) {
  const router = useRouter();
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [status, setStatus] = useState("");
  if (teams.length === 0) {
    return (
      <Link href="/team" className="text-xs text-[var(--accent-hover)] hover:underline">
        Załóż drużynę, żeby zapisywać zagrywki na tablicy
      </Link>
    );
  }
  const create = async () => {
    setStatus("Tworzę tablicę…");
    const res = await fetch(`/api/teams/${teamId}/boards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.slice(0, 60), map, side: side === "CT" ? "T" : "CT", data }),
    });
    if (!res.ok) {
      setStatus(res.status === 409 ? "Limit tablic w drużynie" : "Nie udało się");
      return;
    }
    const { id } = (await res.json()) as { id: string };
    router.push(`/team/${teamId}/boards/${id}`);
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {teams.length > 1 && (
        <select
          aria-label="Drużyna"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-1 text-xs text-[var(--text-primary)]"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={create}
        className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs text-[var(--accent-hover)] hover:border-[var(--border-hover)]"
      >
        <LayoutDashboard className="h-3 w-3" aria-hidden />
        Na tablicę
      </button>
      {status && <span className="text-xs text-[var(--text-tertiary)]">{status}</span>}
    </span>
  );
}
