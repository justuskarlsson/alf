import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { GridLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useShallow } from "zustand/react/shallow";
import { useRelay } from "../core/RelayProvider";
import { useOnConnect } from "../core/useOnConnect";
import { useGlobalStore } from "../core/globalStore";
import { useDashboardStore, PANEL_TYPES, BUILTIN_PRESETS, type PanelInstance, type PanelType, type LayoutPreset } from "../core/dashboardStore";
import { useAnnotationStore } from "../core/annotationStore";
import { AnnotationLayer } from "../core/AnnotationLayer";
import { FilesPanel } from "../modules/files/FilesPanel";
import { TicketsPanel } from "../modules/tickets/TicketsPanel";
import { GitPanel } from "../modules/git/GitPanel";
import { AgentsPanel } from "../modules/agents/AgentsPanel";

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
    case "files": return <FilesPanel repo={repo} />;
    case "tickets": return <TicketsPanel repo={repo} />;
    case "git": return <GitPanel repo={repo} />;
    case "agents": return <AgentsPanel repo={repo} />;
  }
}

function PresetSelector({ activePreset, userPresets, onLoad, onSave, onDelete }: {
  activePreset: string | null;
  userPresets: LayoutPreset[];
  onLoad: (name: string) => void;
  onSave: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  const allPresets = [...BUILTIN_PRESETS, ...userPresets];
  const builtinNames = new Set(BUILTIN_PRESETS.map(p => p.name));

  return (
    <div className="flex items-center gap-1">
      <select
        value={activePreset ?? ""}
        onChange={e => { if (e.target.value) onLoad(e.target.value); }}
        data-testid="preset-selector"
        className="bg-alf-bg border border-alf-border rounded px-2 py-0.5 text-xs font-mono
                   text-slate-400 cursor-pointer hover:border-slate-500 focus:outline-none
                   focus:border-slate-400 transition-colors"
      >
        {!activePreset && <option value="" style={{ background: "#161b22" }}>Custom</option>}
        {allPresets.map((p, i) => (
          <option key={p.name} value={p.name} style={{ background: "#161b22" }}>
            {`${i + 1}. ${p.name}`}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          const name = prompt("Preset name:");
          if (name?.trim()) onSave(name.trim());
        }}
        title="Save current layout as preset"
        className="font-mono text-xs text-slate-600 hover:text-slate-300 transition-colors px-1.5 py-0.5
                   border border-alf-border rounded hover:border-slate-500 select-none"
      >+</button>
      {activePreset && !builtinNames.has(activePreset) && (
        <button
          onClick={() => onDelete(activePreset)}
          title={`Delete preset "${activePreset}"`}
          className="font-mono text-xs text-slate-600 hover:text-red-400 transition-colors px-1.5 py-0.5
                     border border-alf-border rounded hover:border-slate-500 select-none"
        >-</button>
      )}
    </div>
  );
}

function AnnotationModeToggle() {
  const mode = useAnnotationStore(s => s.mode);
  const setMode = useAnnotationStore(s => s.setMode);

  return (
    <div className="flex items-center gap-1 mx-auto">
      <button
        onClick={() => setMode("text")}
        data-testid="annotation-text-btn"
        className={`font-mono text-xs px-2 py-0.5 border rounded transition-colors select-none
          ${mode === "text"
            ? "border-slate-500 text-slate-200 bg-alf-surface"
            : "border-alf-border text-slate-600 hover:text-slate-400 hover:border-slate-500"}`}
        title="Text annotation mode"
      >A</button>
      <button
        onClick={() => setMode("voice")}
        data-testid="annotation-voice-btn"
        className={`font-mono text-xs px-2 py-0.5 border rounded transition-colors select-none
          ${mode === "voice"
            ? "border-slate-500 text-slate-200 bg-alf-surface"
            : "border-alf-border text-slate-600 hover:text-slate-400 hover:border-slate-500"}`}
        title="Voice annotation mode"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>
    </div>
  );
}

// RepoPage receives repo as prop so parent can set key={repo} and force re-mount on change.
export function RepoPage({ repo }: Props) {
  const navigate = useNavigate();
  const { request } = useRelay();

  // Guard: skip onLayoutChange callbacks until initForRepo has loaded the saved layout.
  // RGL fires onLayoutChange on every render (including the initial one with INITIAL_LAYOUT).
  // Without this guard, the stale initial callback can overwrite saved state via autosave.
  const layoutReady = useRef(false);

  // Set globalStore.repo and load saved dashboard state for this repo.
  // useEffect (not useState initializer) to avoid triggering subscriber updates during render.
  // FilesPanel uses repo prop directly, so effect order doesn't affect initial file loading.
  useEffect(() => {
    useGlobalStore.getState().setRepo(repo);
    useDashboardStore.getState().initForRepo(repo);
    // Allow onLayoutChange callbacks starting from the NEXT render cycle,
    // after React has re-rendered with the saved layout.
    requestAnimationFrame(() => { layoutReady.current = true; });
  }, []);
  const { repos, setRepos } = useGlobalStore(useShallow(s => ({
    repos: s.repos,
    setRepos: s.setRepos,
  })));
  const { panels, layout, freeMode, activePreset, userPresets, addPanel, removePanel, setLayout, toggleFreeMode, loadPreset, savePreset, deletePreset } =
    useDashboardStore(useShallow(s => ({
      panels: s.panels,
      layout: s.layout,
      freeMode: s.freeMode,
      activePreset: s.activePreset,
      userPresets: s.userPresets,
      addPanel: s.addPanel,
      removePanel: s.removePanel,
      setLayout: s.setLayout,
      toggleFreeMode: s.toggleFreeMode,
      loadPreset: s.loadPreset,
      savePreset: s.savePreset,
      deletePreset: s.deletePreset,
    })));

  // Alt+1..9 keyboard shortcuts for preset switching
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const idx = parseInt(e.key) - 1;
      if (isNaN(idx) || idx < 0) return;
      const allPresets = [...BUILTIN_PRESETS, ...userPresets];
      if (idx < allPresets.length) {
        e.preventDefault();
        loadPreset(allPresets[idx].name);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

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

        <AnnotationModeToggle />

        <div className="ml-auto flex items-center gap-2">
          <PresetSelector
            activePreset={activePreset}
            userPresets={userPresets}
            onLoad={loadPreset}
            onSave={savePreset}
            onDelete={deletePreset}
          />
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

      <AnnotationLayer />

      {/* Dashboard */}
      <div ref={containerRef} className="flex-1 min-h-0 p-2 bg-alf-bg">
        <GridLayout
          layout={layout}
          onLayoutChange={newLayout => { if (layoutReady.current) setLayout(newLayout); }}
          width={dims.w}
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
          style={{ height: dims.h }}
        >
          {panels.map(panel => (
            <div key={panel.id} data-testid={`panel-${panel.type}`}>
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
