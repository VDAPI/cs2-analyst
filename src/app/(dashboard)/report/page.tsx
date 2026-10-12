import { getServerSession } from "next-auth";
import { ClipboardCheck } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/ui";
import { ToolEmptyState, ToolMatchGrid } from "@/components/tools/tool-match-grid";

export default async function ReportListPage() {
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
        eyebrow="Analiza"
        title="Raport: co poprawić"
        description="Trzy rzeczy, które najbardziej kosztują cię rundy, a pod nimi każdy błąd z momentem w rundzie, podglądem 2D, radą i porównaniem z pro."
      />
      {matches.length === 0 ? (
        <ToolEmptyState icon={ClipboardCheck} title="Brak meczów do raportu" text="Wgraj demo, a po analizie dostaniesz raport z błędami." />
      ) : (
        <ToolMatchGrid matches={matches} hrefBase="/report" icon={ClipboardCheck} actionLabel="Otwórz raport" />
      )}
    </div>
  );
}
