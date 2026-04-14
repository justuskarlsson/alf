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
  return <div className="h-full flex flex-col overflow-hidden bg-gray-900">{children}</div>;
}

// ---------------------------------------------------------------------------
// SidebarLayout — two-pane horizontal split: resizable sidebar + main area.
// ---------------------------------------------------------------------------

interface SidebarLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  defaultSize?: number;
  minSize?: number;
}

export function SidebarLayout({ sidebar, main, defaultSize = 25, minSize = 15 }: SidebarLayoutProps) {
  return (
    <PanelGroup direction="horizontal" className="h-full w-full">
      <ResizablePanel defaultSize={defaultSize} minSize={minSize}>
        {sidebar}
      </ResizablePanel>
      <PanelResizeHandle className="w-0.5 bg-gray-700 hover:bg-gray-500 transition-colors cursor-col-resize" />
      <ResizablePanel>
        {main}
      </ResizablePanel>
    </PanelGroup>
  );
}

// ---------------------------------------------------------------------------
// CollapsibleSection — sidebar row with collapsible header + content.
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
    ? `border-b border-gray-700 flex flex-col ${open ? "flex-1 min-h-0" : "shrink-0"}`
    : "border-b border-gray-700 shrink-0";

  return (
    <div className={wrapperClass}>
      <button
        className="w-full flex items-center gap-1 px-2 py-1.5 text-xs font-mono text-gray-500 uppercase tracking-wider hover:text-gray-300 hover:bg-white/5 shrink-0"
        onClick={() => setOpen(o => !o)}
      >
        <span className="w-3 text-center">{open ? "▾" : "▸"}</span>
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
// EmptyState — centred placeholder text.
// ---------------------------------------------------------------------------

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-gray-600 text-sm font-mono">
      {message}
    </div>
  );
}
