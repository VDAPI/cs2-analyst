/**
 * Live BullMQ queue lengths for the admin panel. Redis being down must not
 * take the panel with it, so every read has a short timeout.
 */
import type { Queue } from "bullmq";
import { demoParseQueue, faceitDemoDownloadQueue } from "@/lib/queue";

export interface QueueCounts {
  name: string;
  label: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

export type QueueStats = { ok: true; queues: QueueCounts[] } | { ok: false; error: string };

const TIMEOUT_MS = 2_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Redis nie odpowiada")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function countsFor(queue: Pick<Queue, "name" | "getJobCounts">, label: string): Promise<QueueCounts> {
  const c = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
  return {
    name: queue.name,
    label,
    waiting: c.waiting ?? 0,
    active: c.active ?? 0,
    delayed: c.delayed ?? 0,
    failed: c.failed ?? 0,
    completed: c.completed ?? 0,
  };
}

export async function getQueueStats(): Promise<QueueStats> {
  try {
    const queues = await withTimeout(
      Promise.all([
        countsFor(demoParseQueue, "Analiza dem"),
        countsFor(faceitDemoDownloadQueue, "Pobieranie z FACEIT"),
      ]),
      TIMEOUT_MS
    );
    return { ok: true, queues };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
