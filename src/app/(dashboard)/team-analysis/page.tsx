import { TeamAnalysisView } from "./view";

export const metadata = { title: "Analizy drużyn — CS2 Analyst" };

/** /team-analysis — top-level team analysis folders and demos without a folder. */
export default function TeamAnalysisPage() {
  return <TeamAnalysisView folderId={null} />;
}
