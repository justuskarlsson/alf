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

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 h-7 flex items-center border-b border-alf-border shrink-0 bg-alf-canvas">
      <span className="font-mono text-xs text-slate-500 uppercase tracking-widest select-none">
        {children}
      </span>
    </div>
  );
}

// RepoPage receives repo as prop so parent can set key={repo} and force re-mount on change.
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
    <div className="flex flex-col h-screen bg-alf-bg text-slate-200">
      {/* Header */}
      <header className="flex items-center gap-2 px-4 h-9 shrink-0 border-b border-alf-border bg-alf-canvas">
        <span className="font-mono text-xs text-slate-600 select-none">alf /</span>
        <select
          value={repo}
          onChange={e => navigate(`/${e.target.value}`)}
          className="bg-alf-bg border border-alf-border rounded px-2 py-0.5 text-xs font-mono
                     text-slate-300 cursor-pointer hover:border-slate-500 focus:outline-none
                     focus:border-slate-400 transition-colors"
        >
          {(repos.length > 0 ? repos : [repo]).map(r => (
            <option key={r} value={r} style={{ background: "#161b22" }}>
              {r}
            </option>
          ))}
        </select>
      </header>

      {/* Dashboard — all panels visible simultaneously */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" className="h-full w-full">
          <ResizablePanel defaultSize={38} minSize={15}>
            <div className="h-full flex flex-col">
              <PanelLabel>Files</PanelLabel>
              <div className="flex-1 min-h-0"><FilesPanel /></div>
            </div>
          </ResizablePanel>

          <PanelResizeHandle className="w-px bg-alf-border hover:bg-slate-500 transition-colors cursor-col-resize" />

          <ResizablePanel defaultSize={62} minSize={20}>
            <PanelGroup direction="vertical" className="h-full w-full">
              <ResizablePanel defaultSize={55} minSize={15}>
                <div className="h-full flex flex-col">
                  <PanelLabel>Tickets</PanelLabel>
                  <div className="flex-1 min-h-0"><TicketsPanel repo={repo} /></div>
                </div>
              </ResizablePanel>

              <PanelResizeHandle className="h-px bg-alf-border hover:bg-slate-500 transition-colors cursor-row-resize" />

              <ResizablePanel defaultSize={45} minSize={15}>
                <div className="h-full flex flex-col">
                  <PanelLabel>Git</PanelLabel>
                  <div className="flex-1 min-h-0"><GitPanel repo={repo} /></div>
                </div>
              </ResizablePanel>
            </PanelGroup>
          </ResizablePanel>
        </PanelGroup>
      </div>
    </div>
  );
}
