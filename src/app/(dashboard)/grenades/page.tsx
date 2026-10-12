import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Crosshair } from "lucide-react";
import { ToolEmptyState, ToolMatchGrid } from "@/components/tools/tool-match-grid";

export default async function GrenadesListPage() {
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
        title="Granaty"
        description="Trajektorie smoke, flash, HE i molotovów, oślepieni wrogowie i obrażenia z utility dla każdego gracza."
      />
      {matches.length === 0 ? (
        <ToolEmptyState icon={Crosshair} title="Brak meczów do analizy" text="Wgraj demo, aby zobaczyć, jak drużyny używają utility." />
      ) : (
        <ToolMatchGrid matches={matches} hrefBase="/grenades" icon={Crosshair} actionLabel="Otwórz granaty" />
      )}
    </div>
  );
}
