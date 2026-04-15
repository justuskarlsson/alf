import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Panel as ResizablePanel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
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

const CARD = "h-full flex flex-col border border-alf-border rounded-md overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.5)]";

function PanelCard({ label, children, drag }: { label: string; children: ReactNode; drag?: boolean }) {
  return (
    <div className={CARD}>
      <div className={`px-3 h-7 flex items-center gap-2 border-b border-alf-border shrink-0 bg-alf-canvas
                      ${drag ? "panel-drag-handle cursor-grab active:cursor-grabbing" : ""}`}>
        <span className="font-mono text-xs text-slate-500 uppercase tracking-widest select-none">
          {label}
        </span>
        {drag && <span className="ml-auto font-mono text-xs text-slate-700 select-none">⠿</span>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

const ROWS = 10;
const MARGIN = 8 as const;
const INIT_LAYOUT: Layout = [
  { i: "files",   x: 0, y: 0, w: 5, h: ROWS, minW: 2, minH: 2 },
  { i: "tickets", x: 5, y: 0, w: 7, h: 5,    minW: 2, minH: 2 },
  { i: "git",     x: 5, y: 5, w: 7, h: 5,    minW: 2, minH: 2 },
];

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

  const [freeMode, setFreeMode] = useState(false);
  const [layout, setLayout] = useState<Layout>(INIT_LAYOUT);

  // useContainerWidth measures grid width via ResizeObserver
  const { width: gridWidth, containerRef } = useContainerWidth({ initialWidth: 1200 });
  // Track height separately (useContainerWidth only tracks width)
  const heightRef = useRef<HTMLDivElement>(null);
  const [availH, setAvailH] = useState(600);

  useEffect(() => {
    const el = heightRef.current;
    if (!el) return;
    const obs = new ResizeObserver(e => setAvailH(Math.floor(e[0].contentRect.height)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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

  const rowHeight = Math.max(Math.floor((availH - MARGIN * (ROWS + 1)) / ROWS), 20);

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
        <button
          onClick={() => setFreeMode(m => !m)}
          title={freeMode ? "Lock layout" : "Unlock layout"}
          className="ml-auto font-mono text-xs text-slate-600 hover:text-slate-300 transition-colors px-2 py-0.5
                     border border-alf-border rounded hover:border-slate-500 select-none"
        >
          {freeMode ? "🔓 unlock" : "🔒 lock"}
        </button>
      </header>

      {/* Dashboard */}
      <div ref={heightRef} className="flex-1 min-h-0 p-2 bg-alf-bg">
        {freeMode ? (
          <div ref={containerRef} style={{ height: availH }}>
            <GridLayout
              layout={layout}
              onLayoutChange={newLayout => setLayout(newLayout)}
              width={gridWidth}
              autoSize={false}
              gridConfig={{
                cols: 12,
                rowHeight,
                margin: [MARGIN, MARGIN] as [number, number],
                containerPadding: [0, 0] as [number, number],
                maxRows: Infinity,
              }}
              dragConfig={{ enabled: true, handle: ".panel-drag-handle", bounded: false, threshold: 3 }}
            >
              <div key="files"><PanelCard label="Files" drag><FilesPanel /></PanelCard></div>
              <div key="tickets"><PanelCard label="Tickets" drag><TicketsPanel repo={repo} /></PanelCard></div>
              <div key="git"><PanelCard label="Git" drag><GitPanel repo={repo} /></PanelCard></div>
            </GridLayout>
          </div>
        ) : (
          <PanelGroup direction="horizontal" className="h-full w-full">
            <ResizablePanel defaultSize={38} minSize={15}>
              <PanelCard label="Files"><FilesPanel /></PanelCard>
            </ResizablePanel>

            <PanelResizeHandle className="w-2 bg-alf-bg cursor-col-resize" />

            <ResizablePanel defaultSize={62} minSize={20}>
              <PanelGroup direction="vertical" className="h-full w-full">
                <ResizablePanel defaultSize={55} minSize={15}>
                  <PanelCard label="Tickets"><TicketsPanel repo={repo} /></PanelCard>
                </ResizablePanel>

                <PanelResizeHandle className="h-2 bg-alf-bg cursor-row-resize" />

                <ResizablePanel defaultSize={45} minSize={15}>
                  <PanelCard label="Git"><GitPanel repo={repo} /></PanelCard>
                </ResizablePanel>
              </PanelGroup>
            </ResizablePanel>
          </PanelGroup>
        )}
      </div>
    </div>
  );
}
