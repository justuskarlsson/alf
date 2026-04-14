import React from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

interface PanelDef {
  id: string;
  content: React.ReactNode;
  defaultSize?: number;
  minSize?: number;
}

interface Props {
  panels: PanelDef[];
  direction?: "horizontal" | "vertical";
}

export function PanelGrid({ panels, direction = "horizontal" }: Props) {
  return (
    <PanelGroup direction={direction} className="h-full w-full">
      {panels.map((p, i) => (
        <React.Fragment key={p.id}>
          {i > 0 && (
            <PanelResizeHandle className="w-px bg-white/10 hover:bg-white/30 transition-colors" />
          )}
          <Panel defaultSize={p.defaultSize} minSize={p.minSize ?? 8}>
            {p.content}
          </Panel>
        </React.Fragment>
      ))}
    </PanelGroup>
  );
}
