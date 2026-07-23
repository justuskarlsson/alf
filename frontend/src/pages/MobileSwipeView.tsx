import { useEffect, useState, useRef, type ReactNode } from "react";
import { PANEL_TYPES, type PanelInstance } from "../core/dashboardStore";
import { MobileSidebarProvider, useMobileSidebar } from "../core/mobileSidebar";

interface Props {
  panels: PanelInstance[];
  repo: string;
  renderPanel: (panel: PanelInstance, repo: string) => ReactNode;
}

/** Elements where a horizontal drag should scroll content, not change panels. */
const SWIPE_BLOCK_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[data-no-panel-swipe]",
  ".overflow-auto",
  ".overflow-x-auto",
  ".overflow-y-auto",
  ".overflow-scroll",
].join(",");

export function MobileSwipeView(props: Props) {
  return (
    <MobileSidebarProvider>
      <MobileSwipeViewInner {...props} />
    </MobileSidebarProvider>
  );
}

function MobileSwipeViewInner({ panels, repo, renderPanel }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const touchRef = useRef<{ startX: number; startY: number; blocked: boolean } | null>(null);
  const sidebar = useMobileSidebar();

  // Close sidebar sheet when switching panels.
  useEffect(() => {
    sidebar?.setOpen(false);
  }, [activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTouchStart(e: React.TouchEvent) {
    const target = e.target as HTMLElement | null;
    const blocked = !!target?.closest(SWIPE_BLOCK_SELECTOR);
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY, blocked };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchRef.current) return;
    const { startX, startY, blocked } = touchRef.current;
    touchRef.current = null;
    if (blocked) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    // Only register horizontal swipes (dx > dy and significant distance)
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0 && activeIdx < panels.length - 1) {
      setActiveIdx(i => i + 1);
    } else if (dx > 0 && activeIdx > 0) {
      setActiveIdx(i => i - 1);
    }
  }

  const panel = panels[activeIdx];
  if (!panel) return null;

  const sheetOpen = !!sidebar?.open && sidebar.content != null;

  return (
    <div className="relative flex flex-col h-full">
      {/* Tab bar — hamburger left of Agents, ~44px touch targets */}
      <div className="flex items-center border-b border-alf-border bg-alf-canvas shrink-0 overflow-x-auto">
        <button
          type="button"
          aria-label={sheetOpen ? "Close menu" : "Open menu"}
          aria-expanded={sheetOpen}
          disabled={!sidebar?.content}
          onClick={() => sidebar?.setOpen(!sidebar.open)}
          className="min-h-11 min-w-11 shrink-0 flex items-center justify-center
                     text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors
                     border-r border-alf-border"
        >
          <HamburgerIcon open={sheetOpen} />
        </button>
        {panels.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveIdx(i)}
            className={`min-h-11 px-4 text-xs font-mono whitespace-nowrap transition-colors
              ${i === activeIdx
                ? "text-slate-200 border-b-2 border-slate-400"
                : "text-slate-600 hover:text-slate-400"}`}
          >
            {p.title ?? PANEL_TYPES[p.type].label}
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div
        className="flex-1 min-h-0"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {renderPanel(panel, repo)}
      </div>

      {/* Dot indicators — tappable */}
      {panels.length > 1 && (
        <div className="flex justify-center gap-1 py-1 shrink-0 bg-alf-canvas border-t border-alf-border
                        pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {panels.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to panel ${i + 1}`}
              aria-current={i === activeIdx}
              onClick={() => setActiveIdx(i)}
              className="min-h-11 min-w-11 flex items-center justify-center"
            >
              <span
                className={`block w-2 h-2 rounded-full transition-colors
                  ${i === activeIdx ? "bg-slate-400" : "bg-slate-700"}`}
              />
            </button>
          ))}
        </div>
      )}

      {/* Sidebar sheet — opened from top hamburger */}
      {sheetOpen && (
        <>
          <button
            type="button"
            aria-label="Dismiss menu"
            className="absolute inset-0 z-40 bg-black/50"
            onClick={() => sidebar?.setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 z-50 flex flex-col
                       max-h-[85%] rounded-t-lg border-t border-alf-border
                       bg-alf-canvas shadow-[0_-8px_32px_rgba(0,0,0,0.45)]
                       pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-alf-border shrink-0">
              <span className="font-mono text-xs text-slate-500 uppercase tracking-widest">Menu</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => sidebar?.setOpen(false)}
                className="min-h-11 min-w-11 flex items-center justify-center
                           text-slate-500 hover:text-slate-200 text-lg"
              >
                ×
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {sidebar?.content}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <span className="relative block w-5 h-3.5" aria-hidden>
      <span className={`absolute left-0 right-0 h-0.5 bg-current transition-all
        ${open ? "top-1.5 rotate-45" : "top-0"}`} />
      <span className={`absolute left-0 right-0 top-1.5 h-0.5 bg-current transition-opacity
        ${open ? "opacity-0" : "opacity-100"}`} />
      <span className={`absolute left-0 right-0 h-0.5 bg-current transition-all
        ${open ? "top-1.5 -rotate-45" : "bottom-0 top-auto"}`} />
    </span>
  );
}
