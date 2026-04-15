import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Layout } from "react-grid-layout";

// Panel type registry — add new panel types here.
export type PanelType = "files" | "tickets" | "git";

export const PANEL_TYPES: Record<PanelType, { label: string }> = {
  files:   { label: "Files" },
  tickets: { label: "Tickets" },
  git:     { label: "Git" },
};

export interface PanelInstance {
  id: string;
  type: PanelType;
  title?: string;
  args: Record<string, string>;
}

const INITIAL_PANELS: PanelInstance[] = [
  { id: "files-0",   type: "files",   args: {} },
  { id: "tickets-0", type: "tickets", args: {} },
  { id: "git-0",     type: "git",     args: {} },
];

const INITIAL_LAYOUT: Layout = [
  { i: "files-0",   x: 0, y: 0, w: 5, h: 10, minW: 2, minH: 2 },
  { i: "tickets-0", x: 5, y: 0, w: 7, h: 5,  minW: 2, minH: 2 },
  { i: "git-0",     x: 5, y: 5, w: 7, h: 5,  minW: 2, minH: 2 },
];

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
  // Per-repo saved dashboards (persisted to localStorage)
  saved: Record<string, RepoDashboard>;
  // Actions
  initForRepo: (repo: string) => void;
  addPanel: (type: PanelType) => void;
  removePanel: (id: string) => void;
  setLayout: (layout: Layout) => void;
  toggleFreeMode: () => void;
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set, get) => ({
      panels: INITIAL_PANELS,
      layout: INITIAL_LAYOUT,
      freeMode: false,
      activeRepo: null,
      saved: {},

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
        return autosave(s, { panels, layout });
      }),

      removePanel: (id) => set(s => {
        const panels = s.panels.filter(p => p.id !== id);
        const layout  = s.layout.filter(l => l.i !== id);
        return autosave(s, { panels, layout });
      }),

      setLayout: (layout) => set(s => autosave(s, { layout })),

      toggleFreeMode: () => set(s => autosave(s, { freeMode: !s.freeMode })),
    }),
    {
      name: "alf-dashboard",
      // Only persist the saved record, not the transient active session.
      partialize: s => ({ saved: s.saved }),
    }
  )
);

// Merge patch into current session and auto-save to the active repo's slot.
function autosave(s: DashboardStore, patch: Partial<RepoDashboard>): Partial<DashboardStore> {
  const session: RepoDashboard = {
    panels:   patch.panels   ?? s.panels,
    layout:   patch.layout   ?? s.layout,
    freeMode: patch.freeMode ?? s.freeMode,
  };
  const saved = s.activeRepo
    ? { ...s.saved, [s.activeRepo]: session }
    : s.saved;
  return { ...session, saved };
}
