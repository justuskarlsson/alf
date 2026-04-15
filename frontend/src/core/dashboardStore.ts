import { create } from "zustand";
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
  title?: string;       // optional label override
  args: Record<string, string>;
}

// Default dashboard: three panels matching the original fixed layout.
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

interface DashboardStore {
  panels: PanelInstance[];
  layout: Layout;
  freeMode: boolean;
  addPanel: (type: PanelType) => void;
  removePanel: (id: string) => void;
  setLayout: (layout: Layout) => void;
  toggleFreeMode: () => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  panels: INITIAL_PANELS,
  layout: INITIAL_LAYOUT,
  freeMode: false,

  addPanel: (type) => set(s => {
    const id = `${type}-${Date.now()}`;
    return {
      panels: [...s.panels, { id, type, args: {} }],
      layout: [...s.layout, { i: id, x: 0, y: 0, w: 4, h: 5, minW: 2, minH: 2 }],
    };
  }),

  removePanel: (id) => set(s => ({
    panels: s.panels.filter(p => p.id !== id),
    layout:  s.layout.filter(l => l.i !== id),
  })),

  setLayout: (layout) => set({ layout }),
  toggleFreeMode: () => set(s => ({ freeMode: !s.freeMode })),
}));
