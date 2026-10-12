"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoachStatus } from "@/lib/coach/text";

/**
 * The coach's text on a page (S15): starts with what the server rendered
 * (cached AI text or the standard text) and, when the AI hasn't written it
 * yet, asks for it once in the background. `rewrite()` asks for a new one.
 */
export function useCoachText<T>(url: string, body: Record<string, unknown>, initial: { text: T; status: CoachStatus }, aiEnabled: boolean) {
  const [state, setState] = useState(initial);
  const [writing, setWriting] = useState(false);
  const asked = useRef(false);
  const payload = JSON.stringify(body);

  const request = useCallback(
    async (force: boolean) => {
      setWriting(true);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...JSON.parse(payload), force }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setState((await res.json()) as { text: T; status: CoachStatus });
      } catch {
        setState((s) => ({ ...s, status: "failed" }));
      } finally {
        setWriting(false);
      }
    },
    [url, payload]
  );

  useEffect(() => {
    if (asked.current || !aiEnabled || initial.status !== "pending") return;
    asked.current = true;
    void request(false);
  }, [aiEnabled, initial.status, request]);

  return { ...state, writing, rewrite: () => request(true) };
}
