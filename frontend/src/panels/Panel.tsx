import { useState } from "react";
import type { ReactNode } from "react";
import {
  Panel as ResizablePanel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";

export function Panel({ children }: { children: ReactNode }) {
  return <div className="h-full flex flex-col overflow-hidden bg-alf-canvas">{children}</div>;
}

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
      <PanelResizeHandle className="w-px bg-alf-border hover:bg-slate-500 transition-colors cursor-col-resize" />
      <ResizablePanel>
        {main}
      </ResizablePanel>
    </PanelGroup>
  );
}

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
    ? `border-b border-alf-muted flex flex-col ${open ? "flex-1 min-h-0" : "shrink-0"}`
    : "border-b border-alf-muted shrink-0";

  return (
    <div className={wrapperClass}>
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-mono text-slate-500
                   uppercase tracking-widest hover:text-slate-300 hover:bg-alf-surface shrink-0
                   transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="w-3 text-center opacity-60">{open ? "▾" : "▸"}</span>
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

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-slate-600 text-xs font-mono">
      {message}
    </div>
  );
}
