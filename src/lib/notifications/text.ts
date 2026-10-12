/**
 * Notification text, rendered in the reader's language from type + data
 * (nothing language-specific is stored). Shared by the bell (client) and the
 * push sender (worker).
 */
import { mapDisplayName } from "@/lib/utils/mapNames";
import type { TFunction } from "@/lib/i18n/translate";

export type NotificationKind = "ANALYSIS_DONE" | "ANALYSIS_FAILED";

export interface NotificationData {
  map?: string | null;
  score?: string | null;
  fileName?: string | null;
  error?: string | null;
}

export interface NotificationView {
  title: string;
  body: string;
  /** Where a click goes. */
  url: string;
}

function matchLabel(t: TFunction, data: NotificationData): string {
  if (data.map) return [mapDisplayName(data.map), data.score].filter(Boolean).join(" ");
  if (data.fileName) return data.fileName;
  return t("notifications.unknownMatch");
}

export function notificationView(
  t: TFunction,
  n: { type: NotificationKind; matchId: string | null; data: NotificationData }
): NotificationView {
  const match = matchLabel(t, n.data);
  if (n.type === "ANALYSIS_DONE") {
    return {
      title: t("notifications.doneTitle"),
      body: t("notifications.doneBody", { match }),
      url: n.matchId ? `/matches/${n.matchId}` : "/library",
    };
  }
  return {
    title: t("notifications.failedTitle"),
    body: n.data.error
      ? t("notifications.failedBody", { match, error: n.data.error.slice(0, 140) })
      : t("notifications.failedBodyNoError", { match }),
    url: "/queue",
  };
}

/** Parses the Json column defensively (rows are written by us, but typed as Json). */
export function toNotificationData(json: unknown): NotificationData {
  if (typeof json !== "object" || json === null) return {};
  const o = json as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return { map: str(o.map), score: str(o.score), fileName: str(o.fileName), error: str(o.error) };
}
