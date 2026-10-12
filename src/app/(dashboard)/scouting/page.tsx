import { PageHeader } from "@/components/ui";
import { ScoutingView } from "./scouting-view";

export const metadata = { title: "Scouting rywali" };

export default async function ScoutingPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room } = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Przed meczem"
        title="Scouting rywali"
        description="Wklej link do pokoju meczu FACEIT. Pobierzemy statystyki 10 graczy (mapy, winrate, K/D, forma) i podpowiemy, co banować. Bez pobierania dem."
      />
      <ScoutingView initialRoom={room ?? ""} />
    </div>
  );
}
