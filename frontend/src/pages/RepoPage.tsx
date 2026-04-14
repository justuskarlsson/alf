import { useState } from "react";
import { useRelay } from "../core/RelayProvider";
import { useOnConnect } from "../core/useOnConnect";
import { useFilesStore, type FileEntry } from "../modules/files/store";
import { FilesPanel } from "../modules/files/FilesPanel";
import { TicketsPanel } from "../modules/tickets/TicketsPanel";
import { GitPanel } from "../modules/git/GitPanel";

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

  return (
    <div className="flex flex-col h-screen bg-alf-bg text-gray-100">
      <div className="flex items-center px-3 border-b border-alf-border shrink-0">
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
        {view === "files"   && <FilesPanel />}
        {view === "tickets" && <TicketsPanel repo={repo} />}
        {view === "git"     && <GitPanel repo={repo} />}
      </div>
    </div>
  );
}
