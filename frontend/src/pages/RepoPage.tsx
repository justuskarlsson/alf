import { useNavigate } from "react-router-dom";
import {
  Panel as ResizablePanel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { useShallow } from "zustand/react/shallow";
import { useRelay } from "../core/RelayProvider";
import { useOnConnect } from "../core/useOnConnect";
import { useFilesStore, type FileEntry } from "../modules/files/store";
import { useReposStore } from "../modules/repos/store";
import { FilesPanel } from "../modules/files/FilesPanel";
import { TicketsPanel } from "../modules/tickets/TicketsPanel";
import { GitPanel } from "../modules/git/GitPanel";

interface Props {
  repo: string;
}

// Thin label bar shown at the top of each top-level panel slot.
function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 h-7 flex items-center border-b border-gray-700 shrink-0 bg-gray-800/40">
      <span className="font-mono text-xs text-gray-500 uppercase tracking-widest select-none">
        {children}
      </span>
    </div>
  );
}

// Note: RepoPage receives repo as a prop (not useParams) so the parent can set
// key={repo} and force a full re-mount on repo change — avoiding useEffect deps.
export function RepoPage({ repo }: Props) {
  const navigate = useNavigate();
  const { request } = useRelay();
  const { repos, setRepos } = useReposStore();
  const { setRepo, setFiles, setSelectedFile, setFileContent } = useFilesStore(
    useShallow(s => ({
      setRepo: s.setRepo,
      setFiles: s.setFiles,
      setSelectedFile: s.setSelectedFile,
      setFileContent: s.setFileContent,
    }))
  );

  useOnConnect(() => {
    request<{ repos: string[] }>({ type: "repos/list" })
      .then(res => setRepos(res.repos))
      .catch(console.error);
    setRepo(repo);
    setFiles([]);
    setSelectedFile(null);
    setFileContent(null);
    request<{ files: FileEntry[] }>({ type: "files/list", repo })
      .then(res => setFiles(res.files))
      .catch(console.error);
  });

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="flex items-center gap-2 px-4 h-9 shrink-0 border-b border-gray-700 bg-gray-900">
        <span className="font-mono text-xs text-gray-600 select-none">alf /</span>
        <select
          value={repo}
          onChange={e => navigate(`/${e.target.value}`)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs font-mono
                     text-gray-200 cursor-pointer hover:border-gray-500 focus:outline-none
                     focus:border-gray-400 transition-colors"
        >
          {(repos.length > 0 ? repos : [repo]).map(r => (
            <option key={r} value={r} className="bg-gray-800">
              {r}
            </option>
          ))}
        </select>
      </header>

      {/* Dashboard: all panels visible simultaneously */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" className="h-full w-full">
          {/* Left: Files */}
          <ResizablePanel defaultSize={38} minSize={15}>
            <div className="h-full flex flex-col">
              <PanelLabel>Files</PanelLabel>
              <div className="flex-1 min-h-0">
                <FilesPanel />
              </div>
            </div>
          </ResizablePanel>

          <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-blue-500/60 transition-colors cursor-col-resize" />

          {/* Right: Tickets + Git stacked vertically */}
          <ResizablePanel defaultSize={62} minSize={20}>
            <PanelGroup direction="vertical" className="h-full w-full">
              <ResizablePanel defaultSize={55} minSize={15}>
                <div className="h-full flex flex-col">
                  <PanelLabel>Tickets</PanelLabel>
                  <div className="flex-1 min-h-0">
                    <TicketsPanel repo={repo} />
                  </div>
                </div>
              </ResizablePanel>

              <PanelResizeHandle className="h-1 bg-gray-700 hover:bg-blue-500/60 transition-colors cursor-row-resize" />

              <ResizablePanel defaultSize={45} minSize={15}>
                <div className="h-full flex flex-col">
                  <PanelLabel>Git</PanelLabel>
                  <div className="flex-1 min-h-0">
                    <GitPanel repo={repo} />
                  </div>
                </div>
              </ResizablePanel>
            </PanelGroup>
          </ResizablePanel>
        </PanelGroup>
      </div>
    </div>
  );
}
