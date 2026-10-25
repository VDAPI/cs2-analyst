/**
 * Team analysis folders (TeamFolder): a player's own tree of folders for
 * scouting demos (/team-analysis), e.g. "RRISK / Mirage / LAN 2026".
 */
import type { PrismaClient } from "@prisma/client";

export interface FolderRow {
  id: string;
  parentId: string | null;
  name: string;
  steamIds: string[];
}

export interface FolderOption {
  id: string;
  /** "RRISK / Mirage", for pickers. */
  path: string;
  depth: number;
}

/** Folders deeper than this are refused (keeps paths and recursion sane). */
export const MAX_FOLDER_DEPTH = 6;

export async function userFolders(prisma: PrismaClient, userId: string): Promise<FolderRow[]> {
  return prisma.teamFolder.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, parentId: true, name: true, steamIds: true },
  });
}

/** Every folder as a path, parents before children (for selects). */
export function folderOptions(rows: FolderRow[]): FolderOption[] {
  const children = new Map<string | null, FolderRow[]>();
  for (const r of rows) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r]);
  const out: FolderOption[] = [];
  const walk = (parent: string | null, prefix: string, depth: number) => {
    for (const r of children.get(parent) ?? []) {
      const path = prefix ? `${prefix} / ${r.name}` : r.name;
      out.push({ id: r.id, path, depth });
      if (depth < MAX_FOLDER_DEPTH) walk(r.id, path, depth + 1);
    }
  };
  walk(null, "", 0);
  return out;
}

/** The folder and all folders below it. */
export function subtreeIds(rows: FolderRow[], rootId: string): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length; i++) for (const r of rows) if (r.parentId === out[i]) out.push(r.id);
  return out;
}

/** Root-to-folder chain for breadcrumbs. */
export function folderChain(rows: FolderRow[], id: string): FolderRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const chain: FolderRow[] = [];
  for (let cur = byId.get(id); cur && chain.length <= MAX_FOLDER_DEPTH; cur = cur.parentId ? byId.get(cur.parentId) : undefined) chain.unshift(cur);
  return chain;
}

/** The roster a folder analyses: its own, else the nearest parent's. */
export function folderRoster(rows: FolderRow[], id: string): string[] {
  const chain = folderChain(rows, id);
  for (let i = chain.length - 1; i >= 0; i--) if (chain[i].steamIds.length > 0) return chain[i].steamIds;
  return [];
}
