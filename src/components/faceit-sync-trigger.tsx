"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function FaceitSyncTrigger() {
  const { data: session } = useSession();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{
    synced: number;
    errors: string[];
  } | null>(null);

  useEffect(() => {
    if (!session?.user?.faceitId) return;

    let cancelled = false;

    async function sync() {
      setSyncing(true);
      try {
        const res = await fetch("/api/faceit/sync", { method: "POST" });
        if (!res.ok) return;

        const data = await res.json();
        if (cancelled) return;

        setResult(data);

        // Refresh the page data if new matches were synced
        if (data.synced > 0) {
          router.refresh();
        }
      } catch {
        // Silently fail — sync is best-effort
      } finally {
        if (!cancelled) setSyncing(false);
      }
    }

    sync();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.faceitId, router]);

  if (!session?.user?.faceitId) return null;

  if (syncing) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-[rgba(255,85,0,0.08)] px-3 py-2 text-xs text-[#ff5500]">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Syncing FACEIT matches...
      </div>
    );
  }

  if (result && result.synced > 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-[rgba(34,197,94,0.08)] px-3 py-2 text-xs text-[var(--success)]">
        Synced {result.synced} new FACEIT match{result.synced !== 1 ? "es" : ""}
      </div>
    );
  }

  return null;
}
