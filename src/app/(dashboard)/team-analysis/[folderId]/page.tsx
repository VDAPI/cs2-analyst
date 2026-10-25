import { TeamAnalysisView } from "../view";

export const metadata = { title: "Analizy drużyn — CS2 Analyst" };

/** /team-analysis/[folderId] — one folder: subfolders, its team's summary, its demos. */
export default async function TeamAnalysisFolderPage({
  params,
  searchParams,
}: {
  params: Promise<{ folderId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ folderId }, { page }] = await Promise.all([params, searchParams]);
  return <TeamAnalysisView folderId={folderId} page={Number(page) || 1} />;
}
