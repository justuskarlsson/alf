import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Panel as ResizablePanel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";

export function Panel({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-0 flex flex-col overflow-hidden bg-alf-canvas">{children}</div>;
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
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    sectionRef.current.style.flex = "";
    resetSiblingSectionFlex(sectionRef.current);
  }, [open]);

  const wrapperClass = open
    ? "alf-collapsible-section border-b border-alf-muted flex flex-col flex-1 basis-0 min-h-0 overflow-hidden"
    : "alf-collapsible-section border-b border-alf-muted shrink-0 overflow-hidden";

  return (
    <div ref={sectionRef} className={wrapperClass} data-collapsible-section data-open={open ? "true" : "false"}>
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-mono text-slate-500
                   uppercase tracking-widest hover:text-slate-300 hover:bg-alf-surface shrink-0
                   transition-colors"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="w-3 text-center opacity-60">{open ? "▾" : "▸"}</span>
        {title}
      </button>
      {open && (
        <>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {children}
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            className="h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-slate-500/50 transition-colors"
            onPointerDown={startSectionResize}
          />
        </>
      )}
    </div>
  );
}

function startSectionResize(event: React.PointerEvent<HTMLDivElement>) {
  const current = event.currentTarget.closest<HTMLElement>("[data-collapsible-section]");
  const next = nextOpenSection(current);
  if (!current || !next) return;
  const currentSection = current;
  const nextSection = next;

  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);

  const startY = event.clientY;
  const currentStart = current.getBoundingClientRect().height;
  const nextStart = next.getBoundingClientRect().height;
  const total = currentStart + nextStart;
  const min = 40;

  function onPointerMove(moveEvent: PointerEvent) {
    const currentHeight = Math.max(min, Math.min(total - min, currentStart + moveEvent.clientY - startY));
    currentSection.style.flex = `0 0 ${currentHeight}px`;
    nextSection.style.flex = `0 0 ${total - currentHeight}px`;
  }

  function onPointerUp() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  }

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

function nextOpenSection(section: HTMLElement | null) {
  let next = section?.nextElementSibling;
  while (next) {
    if (next instanceof HTMLElement && next.dataset.open === "true") return next;
    next = next.nextElementSibling;
  }
  return null;
}

function resetSiblingSectionFlex(section: HTMLElement) {
  window.requestAnimationFrame(() => {
    const parent = section.parentElement;
    if (!parent) return;
    for (const sibling of parent.querySelectorAll<HTMLElement>("[data-collapsible-section][data-open='true']")) {
      sibling.style.flex = "";
    }
  });
}

interface PanelHeaderProps {
  title: string;
  children?: ReactNode;
}

/** Shared header bar — title on the left, action controls on the right. */
export function PanelHeader({ title, children }: PanelHeaderProps) {
  return (
    <div className="px-3 py-2 border-b border-alf-border shrink-0 flex items-center justify-between">
      <span className="font-mono text-xs text-slate-500 uppercase tracking-widest">{title}</span>
      {children && <div className="flex items-center gap-2">{children}</div>}
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
