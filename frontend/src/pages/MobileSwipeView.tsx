import { useState, useRef, type ReactNode } from "react";
import { PANEL_TYPES, type PanelInstance } from "../core/dashboardStore";

interface Props {
  panels: PanelInstance[];
  repo: string;
  renderPanel: (panel: PanelInstance, repo: string) => ReactNode;
}

export function MobileSwipeView({ panels, repo, renderPanel }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const touchRef = useRef<{ startX: number; startY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.startX;
    const dy = t.clientY - touchRef.current.startY;
    touchRef.current = null;

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

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
      {/* Tab bar */}
      <div className="flex items-center border-b border-alf-border bg-alf-canvas shrink-0 overflow-x-auto">
        {panels.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setActiveIdx(i)}
            className={`px-3 py-2 text-xs font-mono whitespace-nowrap transition-colors
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

      {/* Dot indicators */}
      {panels.length > 1 && (
        <div className="flex justify-center gap-1.5 py-1.5 shrink-0 bg-alf-canvas border-t border-alf-border">
          {panels.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors
                ${i === activeIdx ? "bg-slate-400" : "bg-slate-700"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
