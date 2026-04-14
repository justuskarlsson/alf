import { useState } from "react";
import { useRelay } from "../core/RelayProvider";
import { useOnConnect } from "../core/useOnConnect";
import { useFilesStore, type FileEntry } from "../modules/files/store";
import { FileListPanel } from "../modules/files/FileListPanel";
import { FileContentPanel } from "../modules/files/FileContentPanel";
import { TicketsPanel } from "../modules/tickets/TicketsPanel";
import { GitPanel } from "../modules/git/GitPanel";
import { PanelGrid } from "../panels/PanelGrid";

type View = "files" | "tickets" | "git";

const VIEWS: { id: View; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "tickets", label: "Tickets" },
  { id: "git", label: "Git" },
];

interface Props {
  repo: string;
}

// Note: RepoPage receives repo as a prop (not useParams) so the parent can set
// key={repo} and force a full re-mount on repo change — avoiding useEffect deps.
export function RepoPage({ repo }: Props) {
  const { request } = useRelay();
  const { setRepo, setFiles, setSelectedFile, setFileContent } = useFilesStore(s => ({
    setRepo: s.setRepo,
    setFiles: s.setFiles,
    setSelectedFile: s.setSelectedFile,
    setFileContent: s.setFileContent,
  }));
  const selectedFile = useFilesStore(s => s.selectedFile);
  const hasContent = useFilesStore(s => s.fileContent !== null);
  const [view, setView] = useState<View>("files");

  useOnConnect(() => {
    setRepo(repo);
    setFiles([]);
    setSelectedFile(null);
    setFileContent(null);
    request<{ files: FileEntry[] }>({ type: "files/list", repo })
      .then(res => setFiles(res.files))
      .catch(console.error);
  });

  // key forces FileContentPanel re-mount once content is ready (triggers shiki highlight)
  const contentKey = selectedFile ? (hasContent ? selectedFile : `${selectedFile}:loading`) : "empty";

  const mainContent = (() => {
    if (view === "files") {
      return (
        <PanelGrid panels={[
          { id: "files", content: <FileListPanel />, defaultSize: 20, minSize: 12 },
          { id: "main", content: <FileContentPanel key={contentKey} /> },
        ]} />
      );
    }
    if (view === "tickets") return <TicketsPanel repo={repo} />;
    if (view === "git") return <GitPanel repo={repo} />;
    return null;
  })();

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      <div className="flex items-center px-3 border-b border-white/10 shrink-0">
        <span className="font-mono text-xs text-gray-600 mr-4">{repo}</span>
        {VIEWS.map(v => (
          <button
            key={v.id}
            className={`px-3 py-1.5 text-xs font-mono border-b-2 transition-colors
              ${view === v.id
                ? "border-blue-500/70 text-gray-200"
                : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {mainContent}
      </div>
    </div>
  );
}
