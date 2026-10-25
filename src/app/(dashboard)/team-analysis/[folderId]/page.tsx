import { TeamAnalysisView } from "../view";

export const metadata = { title: "Analizy drużyn — CS2 Analyst" };

/** /team-analysis/[folderId] — one folder: subfolders, its team's summary, its demos. */
export default async function TeamAnalysisFolderPage({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  return <TeamAnalysisView folderId={folderId} />;
}
