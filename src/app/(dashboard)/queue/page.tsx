import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getQueueItems } from "@/lib/library";
import { QueueList } from "./queue-list";

export default async function QueuePage() {
  const session = await getServerSession(authOptions);
  const items = session?.user?.id ? await getQueueItems(prisma, session.user.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Analysis queue</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Every demo you sent for analysis, with its status. Finished ones move to the{" "}
            <Link href="/library" className="text-[var(--accent-hover)] hover:underline">
              library
            </Link>
            .
          </p>
        </div>
        <Link
          href="/upload"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--accent)] px-5 text-sm font-medium text-white transition-all hover:bg-[var(--accent-hover)]"
        >
          Upload demos
        </Link>
      </div>
      <QueueList initialItems={items} />
    </div>
  );
}
