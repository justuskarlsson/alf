import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Layout } from "react-grid-layout";

// Panel type registry — add new panel types here.
export type PanelType = "files" | "tickets" | "git" | "agents";

export const PANEL_TYPES: Record<PanelType, { label: string }> = {
  files:   { label: "Files" },
  tickets: { label: "Tickets" },
  git:     { label: "Git" },
  agents:  { label: "Agents" },
};

export interface PanelInstance {
  id: string;
  type: PanelType;
  title?: string;
  args: Record<string, string>;
}

const INITIAL_PANELS: PanelInstance[] = [
  { id: "agents-0",  type: "agents",  args: {} },
  { id: "files-0",   type: "files",   args: {} },
  { id: "tickets-0", type: "tickets", args: {} },
  { id: "git-0",     type: "git",     args: {} },
];

const INITIAL_LAYOUT: Layout = [
  { i: "agents-0",  x: 0, y: 0, w: 8, h: 10, minW: 3, minH: 3 },
  { i: "files-0",   x: 8, y: 0, w: 4, h: 5,  minW: 2, minH: 2 },
  { i: "tickets-0", x: 8, y: 5, w: 4, h: 5,  minW: 2, minH: 2 },
  { i: "git-0",     x: 0, y:10, w:12, h: 5,  minW: 2, minH: 2 },
];

export interface LayoutPreset {
  name: string;
  panels: PanelInstance[];
  layout: Layout;
}

interface RepoDashboard {
  panels: PanelInstance[];
  layout: Layout;
  freeMode: boolean;
}

interface DashboardStore {
  // Active session state
  panels: PanelInstance[];
  layout: Layout;
  freeMode: boolean;
  activeRepo: string | null;
  activePreset: string | null;
  // Per-repo saved dashboards (persisted to localStorage)
  saved: Record<string, RepoDashboard>;
  // User-created presets (persisted to localStorage)
  userPresets: LayoutPreset[];
  // Actions
  initForRepo: (repo: string) => void;
  addPanel: (type: PanelType) => void;
  removePanel: (id: string) => void;
  setLayout: (layout: Layout) => void;
  toggleFreeMode: () => void;
  // Preset actions
  loadPreset: (name: string) => void;
  savePreset: (name: string) => void;
  deletePreset: (name: string) => void;
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({
      panels: INITIAL_PANELS,
      layout: INITIAL_LAYOUT,
      freeMode: false,
      activeRepo: null,
      activePreset: null,
      saved: {},
      userPresets: [],

      initForRepo: (repo) => {
        const saved = get().saved[repo];
        set({
          activeRepo: repo,
          panels:   saved?.panels   ?? INITIAL_PANELS,
          layout:   saved?.layout   ?? INITIAL_LAYOUT,
          freeMode: saved?.freeMode ?? false,
        });
      },

      addPanel: (type) => set(s => {
        const id = `${type}-${Date.now()}`;
        const panels = [...s.panels, { id, type, args: {} }];
        const layout = [...s.layout, { i: id, x: 0, y: 0, w: 4, h: 5, minW: 2, minH: 2 }];
        return autosave(s, { panels, layout }, { activePreset: null });
      }),

      removePanel: (id) => set(s => {
        const panels = s.panels.filter(p => p.id !== id);
        const layout  = s.layout.filter(l => l.i !== id);
        return autosave(s, { panels, layout }, { activePreset: null });
      }),

      setLayout: (layout) => set(s => autosave(s, { layout })),

      toggleFreeMode: () => set(s => autosave(s, { freeMode: !s.freeMode })),

      loadPreset: (name) => {
        const preset = get().userPresets.find(p => p.name === name);
        if (!preset) return;
        set(s => autosave(s, { panels: preset.panels, layout: preset.layout }, { activePreset: name }));
      },

      savePreset: (name) => set(s => {
        const preset: LayoutPreset = { name, panels: s.panels, layout: s.layout };
        const existing = s.userPresets.findIndex(p => p.name === name);
        const userPresets = [...s.userPresets];
        if (existing >= 0) userPresets[existing] = preset;
        else userPresets.push(preset);
        return { userPresets, activePreset: name };
      }),

      deletePreset: (name) => set(s => ({
        userPresets: s.userPresets.filter(p => p.name !== name),
        activePreset: s.activePreset === name ? null : s.activePreset,
      })),
    }),
    {
      name: "alf-dashboard",
      partialize: s => ({ saved: s.saved, userPresets: s.userPresets }),
    }
  )
);

// Merge patch into current session and auto-save to the active repo's slot.
function autosave(s: DashboardStore, patch: Partial<RepoDashboard>, extra: Partial<DashboardStore> = {}): Partial<DashboardStore> {
  const session: RepoDashboard = {
    panels:   patch.panels   ?? s.panels,
    layout:   patch.layout   ?? s.layout,
    freeMode: patch.freeMode ?? s.freeMode,
  };
  const saved = s.activeRepo
    ? { ...s.saved, [s.activeRepo]: session }
    : s.saved;
  return { ...session, saved, ...extra };
}
