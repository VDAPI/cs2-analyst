import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getQueueItems } from "@/lib/library";
import { PageHeader, buttonVariants } from "@/components/ui";
import { Upload } from "lucide-react";
import { QueueList } from "./queue-list";

export default async function QueuePage() {
  const session = await getServerSession(authOptions);
  const items = session?.user?.id ? await getQueueItems(prisma, session.user.id) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analiza"
        title="Kolejka analiz"
        description={
          <>
            Każde demo wysłane do analizy, z jego statusem. Gotowe trafiają do{" "}
            <Link href="/library" className="text-[var(--accent-hover)] hover:underline">
              biblioteki
            </Link>
            .
          </>
        }
        actions={
          <Link href="/upload" className={buttonVariants({ variant: "cta" })}>
            <Upload className="h-4 w-4" aria-hidden />
            Wgraj demo
          </Link>
        }
      />
      <QueueList initialItems={items} />
    </div>
  );
}
