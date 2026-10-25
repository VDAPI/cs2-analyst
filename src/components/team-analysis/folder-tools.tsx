"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui";

type FolderOption = { id: string; path: string };

const inputClass = "rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text-primary)]";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : null;
}

/** "New folder" (inside `parentId`, or at the top). */
export function NewFolderButton({ parentId }: { parentId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
        <FolderPlus className="h-4 w-4" aria-hidden />
        {parentId ? "Nowy podfolder" : "Nowy folder"}
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const res = await send("/api/team-folders", "POST", { name: name.trim(), parentId });
        if (!res) {
          setError("Nie udało się utworzyć folderu");
          return;
        }
        setOpen(false);
        setName("");
        router.refresh();
      }}
    >
      <input autoFocus className={inputClass} placeholder="np. RRISK" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      <button type="submit" className={buttonVariants({ variant: "cta", size: "sm" })}>
        Utwórz
      </button>
      <button type="button" onClick={() => setOpen(false)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Anuluj
      </button>
      {error && <span className="text-xs text-[var(--mistake)]">{error}</span>}
    </form>
  );
}

/** Rename, move or delete the current folder. */
export function FolderActions({
  folder,
  options,
}: {
  folder: { id: string; name: string; parentId: string | null };
  options: FolderOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const [parentId, setParentId] = useState(folder.parentId ?? "");
  const [error, setError] = useState("");

  if (!editing) {
    return (
      <>
        <button type="button" onClick={() => setEditing(true)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <Pencil className="h-4 w-4" aria-hidden />
          Edytuj folder
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm(`Usunąć folder ${folder.name}? Dema i podfoldery przejdą piętro wyżej, nic nie zostanie skasowane.`)) return;
            const res = await send(`/api/team-folders/${folder.id}`, "DELETE");
            if (res) router.push(folder.parentId ? `/team-analysis/${folder.parentId}` : "/team-analysis");
          }}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Usuń folder
        </button>
      </>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await send(`/api/team-folders/${folder.id}`, "PATCH", { name: name.trim(), parentId: parentId || null });
        if (!res) {
          setError("Nie udało się zapisać");
          return;
        }
        setEditing(false);
        router.refresh();
      }}
    >
      <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Nazwa folderu" />
      <select className={inputClass} value={parentId} onChange={(e) => setParentId(e.target.value)} aria-label="Folder nadrzędny">
        <option value="">(na górze)</option>
        {options
          .filter((o) => o.id !== folder.id)
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.path}
            </option>
          ))}
      </select>
      <button type="submit" className={buttonVariants({ variant: "cta", size: "sm" })}>
        Zapisz
      </button>
      <button type="button" onClick={() => setEditing(false)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Anuluj
      </button>
      {error && <span className="text-xs text-[var(--mistake)]">{error}</span>}
    </form>
  );
}

/** Move a demo to another folder. */
export function DemoFolderSelect({ uploadId, folderId, options }: { uploadId: string; folderId: string | null; options: FolderOption[] }) {
  const router = useRouter();
  return (
    <select
      aria-label="Przenieś do folderu"
      className={inputClass}
      value={folderId ?? ""}
      onChange={async (e) => {
        const res = await send(`/api/uploads/${uploadId}`, "PATCH", { folderId: e.target.value || null });
        if (res) router.refresh();
      }}
    >
      <option value="">Bez folderu</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.path}
        </option>
      ))}
    </select>
  );
}

/** Pick the folder's team from one lineup of its demos. */
export function RosterPicker({
  folderId,
  lineups,
}: {
  folderId: string;
  lineups: Array<{ key: string; label: string; steamIds: string[] }>;
}) {
  const router = useRouter();
  const [key, setKey] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const lineup = lineups.find((l) => l.key === key);
        if (!lineup) return;
        const res = await send(`/api/team-folders/${folderId}`, "PATCH", { steamIds: lineup.steamIds.slice(0, 10) });
        if (res) router.refresh();
      }}
    >
      <select className={`${inputClass} min-w-0 flex-1`} value={key} onChange={(e) => setKey(e.target.value)} aria-label="Skład drużyny">
        <option value="">Wybierz skład z dema…</option>
        {lineups.map((l) => (
          <option key={l.key} value={l.key}>
            {l.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={!key} className={buttonVariants({ variant: "secondary", size: "sm" })}>
        Ustaw drużynę
      </button>
    </form>
  );
}

/** On a match's team breakdown: file the demo in team analysis (or back to "my matches"). */
export function TeamAnalysisFiling({
  uploadId,
  kind,
  folderId,
  options,
}: {
  uploadId: string;
  kind: "PLAYER" | "TEAM";
  folderId: string | null;
  options: FolderOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const move = async (body: Record<string, unknown>) => {
    setBusy(true);
    const res = await send(`/api/uploads/${uploadId}`, "PATCH", body);
    setBusy(false);
    if (res) router.refresh();
  };
  if (kind === "PLAYER") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
        To demo jest w Twoich meczach.
        <button type="button" disabled={busy} onClick={() => move({ kind: "TEAM" })} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Przenieś do analiz drużyn
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
      Folder:
      <select
        aria-label="Folder analizy drużynowej"
        className={inputClass}
        value={folderId ?? ""}
        disabled={busy}
        onChange={(e) => move({ folderId: e.target.value || null })}
      >
        <option value="">Bez folderu</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.path}
          </option>
        ))}
      </select>
      <button type="button" disabled={busy} onClick={() => move({ kind: "PLAYER" })} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Przenieś do moich meczów
      </button>
    </div>
  );
}

/** Save a detected team as a folder (its roster); its demos stay where they are. */
export function SaveTeamFolder({ steamIds, defaultName }: { steamIds: string[]; defaultName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
        <FolderPlus className="h-4 w-4" aria-hidden />
        Zapisz jako folder drużyny
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await send("/api/team-folders", "POST", { name: name.trim() || defaultName, steamIds });
        if (res?.id) router.push(`/team-analysis/${String(res.id)}`);
      }}
    >
      <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Nazwa drużyny" />
      <button type="submit" className={buttonVariants({ variant: "cta", size: "sm" })}>
        Zapisz
      </button>
    </form>
  );
}
