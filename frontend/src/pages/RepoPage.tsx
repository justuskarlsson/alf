import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { GridLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useShallow } from "zustand/react/shallow";
import { useRelay } from "../core/RelayProvider";
import { useOnConnect } from "../core/useOnConnect";
import { useGlobalStore } from "../core/globalStore";
import { useDashboardStore, PANEL_TYPES, type PanelInstance, type PanelType } from "../core/dashboardStore";
import { FilesPanel } from "../modules/files/FilesPanel";
import { TicketsPanel } from "../modules/tickets/TicketsPanel";
import { GitPanel } from "../modules/git/GitPanel";

interface Props {
  repo: string;
}

const CARD = "h-full flex flex-col border border-alf-border rounded-md overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.5)]";
const ROWS = 10;
const MARGIN = 8 as const;

function PanelCard({ label, children, drag, onRemove }: {
  label: string;
  children: ReactNode;
  drag?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className={CARD}>
      <div className={`px-3 h-7 flex items-center gap-2 border-b border-alf-border shrink-0 bg-alf-canvas
                      ${drag ? "panel-drag-handle cursor-grab active:cursor-grabbing" : ""}`}>
        <span className="font-mono text-xs text-slate-500 uppercase tracking-widest select-none">
          {label}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {drag && <span className="font-mono text-xs text-slate-700 select-none">⠿</span>}
          {onRemove && (
            <button
              className="text-slate-700 hover:text-red-400 transition-colors text-xs px-1 select-none"
              onClick={onRemove}
              title="Remove panel"
            >✕</button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function renderPanelContent(panel: PanelInstance, repo: string): ReactNode {
  switch (panel.type) {
    case "files":   return <FilesPanel />;
    case "tickets": return <TicketsPanel repo={repo} />;
    case "git":     return <GitPanel repo={repo} />;
  }
}

// RepoPage receives repo as prop so parent can set key={repo} and force re-mount on change.
export function RepoPage({ repo }: Props) {
  const navigate = useNavigate();
  const { request } = useRelay();
  const { repos, setRepo, setRepos } = useGlobalStore(useShallow(s => ({
    repos: s.repos,
    setRepo: s.setRepo,
    setRepos: s.setRepos,
  })));
  const { panels, layout, freeMode, addPanel, removePanel, setLayout, toggleFreeMode } =
    useDashboardStore(useShallow(s => ({
      panels: s.panels,
      layout: s.layout,
      freeMode: s.freeMode,
      addPanel: s.addPanel,
      removePanel: s.removePanel,
      setLayout: s.setLayout,
      toggleFreeMode: s.toggleFreeMode,
    })));

  // Single ResizeObserver for both width and height — fixes the 4K half-width bug.
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 1200, h: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useOnConnect(() => {
    setRepo(repo);
    request<{ repos: string[] }>({ type: "repos/list" })
      .then(res => setRepos(res.repos))
      .catch(console.error);
  });

  const rowHeight = Math.max(Math.floor((dims.h - MARGIN * (ROWS + 1)) / ROWS), 20);

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
            <option key={r} value={r} style={{ background: "#161b22" }}>{r}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          {freeMode && (
            <select
              value=""
              onChange={e => { if (e.target.value) addPanel(e.target.value as PanelType); }}
              className="bg-alf-bg border border-alf-border rounded px-2 py-0.5 text-xs font-mono
                         text-slate-400 cursor-pointer hover:border-slate-500 focus:outline-none
                         focus:border-slate-400 transition-colors"
            >
              <option value="" disabled>+ Add panel</option>
              {Object.entries(PANEL_TYPES).map(([type, { label }]) => (
                <option key={type} value={type} style={{ background: "#161b22" }}>{label}</option>
              ))}
            </select>
          )}
          <button
            onClick={toggleFreeMode}
            title={freeMode ? "Lock layout" : "Unlock layout"}
            className="font-mono text-xs text-slate-600 hover:text-slate-300 transition-colors px-2 py-0.5
                       border border-alf-border rounded hover:border-slate-500 select-none"
          >
            {freeMode ? "🔓 unlock" : "🔒 lock"}
          </button>
        </div>
      </header>

      {/* Dashboard */}
      <div ref={containerRef} className="flex-1 min-h-0 p-2 bg-alf-bg">
        <GridLayout
          layout={layout}
          onLayoutChange={newLayout => setLayout(newLayout)}
          width={dims.w - 16}
          autoSize={false}
          gridConfig={{
            cols: 12,
            rowHeight,
            margin: [MARGIN, MARGIN] as [number, number],
            containerPadding: [0, 0] as [number, number],
            maxRows: Infinity,
          }}
          dragConfig={{
            enabled: freeMode,
            handle: ".panel-drag-handle",
            bounded: false,
            threshold: 3,
          }}
          resizeConfig={{ enabled: freeMode }}
          style={{ height: dims.h - 16 }}
        >
          {panels.map(panel => (
            <div key={panel.id}>
              <PanelCard
                label={panel.title ?? PANEL_TYPES[panel.type].label}
                drag={freeMode}
                onRemove={freeMode ? () => removePanel(panel.id) : undefined}
              >
                {renderPanelContent(panel, repo)}
              </PanelCard>
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  );
}
