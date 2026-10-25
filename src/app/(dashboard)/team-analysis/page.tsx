import { TeamAnalysisView } from "./view";

export const metadata = { title: "Analizy drużyn — CS2 Analyst" };

/** /team-analysis — top-level team analysis folders and demos without a folder. */
export default async function TeamAnalysisPage({ searchParams }: { searchParams: Promise<{ page?: string; map?: string }> }) {
  const { page, map } = await searchParams;
  return <TeamAnalysisView folderId={null} page={Number(page) || 1} map={map} />;
}
