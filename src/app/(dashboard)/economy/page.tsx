import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DollarSign } from "lucide-react";
import { ToolEmptyState, ToolMatchGrid, ToolPageIntro } from "@/components/tools/tool-match-grid";

export default async function EconomyListPage() {
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
      <ToolPageIntro
        overline="Narzędzia"
        title="Ekonomia"
        text="Wartość ekwipunku i gotówka w każdej rundzie, typy zakupów i to, czy drużyna kupuje razem."
      />
      {matches.length === 0 ? (
        <ToolEmptyState title="Brak meczów do analizy" text="Wgraj demo, aby śledzić ekonomię drużyn." />
      ) : (
        <ToolMatchGrid matches={matches} hrefBase="/economy" icon={DollarSign} actionLabel="Otwórz ekonomię" />
      )}
    </div>
  );
}
