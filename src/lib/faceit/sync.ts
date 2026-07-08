import type { DemoFetchStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getMatchHistory, getMatchDetails } from "./api";
import type { FaceitMatchDetail } from "./types";

const SYNC_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/**
 * Pull the demo resource URL out of a Data API match-details payload.
 * Returns { demoResourceUrl, demoStatus } — AVAILABLE if a demo URL is
 * present, NOT_READY otherwise (fresh matches often have no demo yet).
 */
export function extractDemoResource(details: FaceitMatchDetail): {
  demoResourceUrl: string | null;
  demoStatus: DemoFetchStatus;
} {
  const demoUrl = details.demo_url?.[0];
  if (demoUrl && demoUrl.trim().length > 0) {
    return { demoResourceUrl: demoUrl, demoStatus: "AVAILABLE" };
  }
  return { demoResourceUrl: null, demoStatus: "NOT_READY" };
}

/**
 * Fetch match details from the Data API and persist the demo resource URL
 * + status onto the stored FaceitMatch. Used by both the sync loop and the
 * download job (which re-fetches when the resource URL is missing).
 * Returns the resolved demo resource info.
 */
export async function refreshDemoResource(faceitMatchId: string): Promise<{
  demoResourceUrl: string | null;
  demoStatus: DemoFetchStatus;
}> {
  const details = await getMatchDetails(faceitMatchId);
  const resource = extractDemoResource(details);
  await prisma.faceitMatch.update({
    where: { faceitMatchId },
    data: resource,
  });
  return resource;
}

interface SyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}

export async function syncFaceitMatches(userId: string, force = false): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { faceitId: true, lastFaceitSync: true },
  });

  console.log("[FACEIT Sync] User:", {
    userId,
    faceitId: user?.faceitId ?? "NONE",
    lastFaceitSync: user?.lastFaceitSync?.toISOString() ?? "NEVER",
  });

  if (!user?.faceitId) {
    return result;
  }

  // Throttle unless forced
  if (
    !force &&
    user.lastFaceitSync &&
    Date.now() - user.lastFaceitSync.getTime() < SYNC_COOLDOWN_MS
  ) {
    console.log("[FACEIT Sync] Throttled");
    return result;
  }

  // Fetch latest matches
  let matches;
  try {
    matches = await getMatchHistory(user.faceitId);
    console.log("[FACEIT Sync] API returned", matches.length, "matches");
  } catch (err) {
    console.error("[FACEIT Sync] API error:", err);
    result.errors.push(
      `Failed to fetch match history: ${err instanceof Error ? err.message : "Unknown error"}`
    );
    return result;
  }

  const finishedMatches = matches.filter(
    (m) => m.status.toLowerCase() === "finished"
  );
  console.log("[FACEIT Sync] Finished:", finishedMatches.length);

  for (const match of finishedMatches) {
    try {
      // Skip if already stored
      const existing = await prisma.faceitMatch.findUnique({
        where: { faceitMatchId: match.match_id },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      // Fetch match details for map and score
      const details = await getMatchDetails(match.match_id);

      const map = details.voting?.map?.pick?.[0] ?? "unknown";
      const s1 = details.results?.score?.faction1 ?? 0;
      const s2 = details.results?.score?.faction2 ?? 0;
      const score = `${s1}-${s2}`;
      const date = new Date(match.finished_at * 1000);

      // FACEIT URL: convert API URL format to web URL
      let faceitUrl = match.faceit_url || "";
      // faceit_url from API looks like: https://www.faceit.com/en/cs2/room/MATCH_ID
      // Ensure it's a proper URL
      if (!faceitUrl.startsWith("http")) {
        faceitUrl = `https://www.faceit.com/en/cs2/room/${match.match_id}`;
      }
      // Replace {lang} placeholder if present
      faceitUrl = faceitUrl.replace("{lang}", "en");

      const { demoResourceUrl, demoStatus } = extractDemoResource(details);

      await prisma.faceitMatch.create({
        data: {
          userId,
          faceitMatchId: match.match_id,
          map,
          score,
          date,
          faceitUrl,
          competition: match.competition_name ?? null,
          demoResourceUrl,
          demoStatus,
        },
      });

      console.log("[FACEIT Sync] Stored match:", match.match_id, map, score);
      result.synced++;
    } catch (err) {
      console.error("[FACEIT Sync] Error processing match", match.match_id, err);
      result.errors.push(
        `Match ${match.match_id}: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { lastFaceitSync: new Date() },
  });

  return result;
}
