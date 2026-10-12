import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Play } from "lucide-react";
import { ToolEmptyState, ToolMatchGrid } from "@/components/tools/tool-match-grid";

export default async function ReplayListPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const matches = userId
    ? await prisma.match.findMany({
        where: { upload: { userId } },
        select: { id: true, map: true, date: true, scoreCT: true, scoreT: true },
        orderBy: { date: "desc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Narzędzia"
        title="Replay 2D"
        description="Odtwórz każdą rundę z góry: ruch graczy, utility, bomba i killfeed. Na telefonie przybliżasz mapę dwoma palcami."
      />
      {matches.length === 0 ? (
        <ToolEmptyState icon={Play} title="Brak meczów do odtworzenia" text="Wgraj demo, a każda runda trafi do replaya 2D." />
      ) : (
        <ToolMatchGrid matches={matches} hrefBase="/replay" icon={Play} actionLabel="Otwórz replay" />
      )}
    </div>
  );
}
