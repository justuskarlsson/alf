import { useState } from "react";
import type { ReactNode } from "react";
import {
  Panel as ResizablePanel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";

// ---------------------------------------------------------------------------
// Panel — standard full-height flex-col container for any panel content.
// ---------------------------------------------------------------------------

export function Panel({ children }: { children: ReactNode }) {
  return <div className="h-full flex flex-col overflow-hidden">{children}</div>;
}

// ---------------------------------------------------------------------------
// SidebarLayout — two-pane horizontal split: resizable sidebar + main area.
// Replaces the manual PanelGrid two-panel pattern in module panels.
// ---------------------------------------------------------------------------

interface SidebarLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  defaultSize?: number; // sidebar default %
  minSize?: number;     // sidebar minimum %
}

export function SidebarLayout({ sidebar, main, defaultSize = 25, minSize = 15 }: SidebarLayoutProps) {
  return (
    <PanelGroup direction="horizontal" className="h-full w-full">
      <ResizablePanel defaultSize={defaultSize} minSize={minSize}>
        {sidebar}
      </ResizablePanel>
      <PanelResizeHandle className="w-px bg-alf-border hover:bg-white/25 transition-colors" />
      <ResizablePanel>
        {main}
      </ResizablePanel>
    </PanelGroup>
  );
}

// ---------------------------------------------------------------------------
// CollapsibleSection — sidebar row with collapsible header + content.
// Use fill to have the section grow to fill remaining vertical space.
// ---------------------------------------------------------------------------

interface CollapsibleSectionProps {
  title: string;
  fill?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  fill = false,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const wrapperClass = fill
    ? `border-b border-alf-border flex flex-col ${open ? "flex-1 min-h-0" : "shrink-0"}`
    : "border-b border-alf-border shrink-0";

  return (
    <div className={wrapperClass}>
      <button
        className="w-full flex items-center gap-1 px-2 py-1 text-xs font-mono text-gray-400 uppercase tracking-wider hover:text-gray-200 shrink-0"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-gray-600 w-3 text-center">{open ? "▾" : "▸"}</span>
        {title}
      </button>
      {open && (
        <div className={fill ? "flex-1 min-h-0 overflow-hidden" : ""}>
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — centred placeholder text (no selection, loading, empty list).
// ---------------------------------------------------------------------------

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-gray-600 text-sm">
      {message}
    </div>
  );
}
