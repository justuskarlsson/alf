import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRelay } from "../../core/RelayProvider";
import { usePanelInit } from "../../core/usePanelInit";
import { Panel, SidebarLayout, PanelHeader, EmptyState } from "../../panels/Panel";
import { MarkdownRenderer } from "../../shared/MarkdownRenderer";
import { useTicketsStore, type TicketMeta } from "./store";

function TicketList({ repo }: { repo: string }) {
  const { request } = useRelay();
  const { tickets, selectedTicket, selectTicket } = useTicketsStore(useShallow(s => ({
    tickets: s.tickets,
    selectedTicket: s.selectedTicket,
    selectTicket: s.selectTicket,
  })));
  type StatusFilter = "all" | "open" | "future" | "done";
  const FILTERS: StatusFilter[] = ["all", "open", "future", "done"];
  const [filter, setFilter] = useState<StatusFilter>("open");

  const filtered = filter === "all"
    ? tickets
    : tickets.filter(t => (t.status ?? "open") === filter);

  function cycleFilter() {
    setFilter(f => FILTERS[(FILTERS.indexOf(f) + 1) % FILTERS.length]);
  }

  if (tickets.length === 0) return <EmptyState message="No tickets." />;

  return (
    <Panel>
      <PanelHeader title="Tickets">
        <button
          onClick={cycleFilter}
          data-testid="filter-status"
          className={`font-mono text-xs transition-colors ${filter === "all" ? "text-slate-300" : statusColor(filter)}`}
          title="Cycle filter: all → open → future → done"
        >{filter}</button>
      </PanelHeader>
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-alf-muted">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-slate-600 text-xs font-mono">
              No matching tickets.
            </div>
          )}
          {filtered.map(t => (
            <div
              key={t.id}
              className={`px-3 py-2 cursor-pointer select-none transition-colors
                ${selectedTicket?.id === t.id ? "bg-alf-surface" : "hover:bg-alf-surface/60"}`}
              onClick={() => selectTicket(t.id, repo, request)}
            >
              <div className="font-mono text-sm text-slate-200 truncate">{t.filename}</div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {t.status && (
                  <span
                    data-testid={`ticket-status-${t.status}`}
                    className={`text-xs font-mono ${statusColor(t.status)}`}
                  >
                    {t.status}
                  </span>
                )}
                {t.epic && <span className="text-xs text-purple-400/60 font-mono">{t.epic}</span>}
                {t.tags?.map(tag => (
                  <span key={tag} className="text-xs text-sky-400/50 font-mono">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function TicketDetail() {
  const selectedTicket = useTicketsStore(s => s.selectedTicket);

  if (!selectedTicket) return <EmptyState message="Select a ticket" />;

  return (
    <Panel>
      <div className="px-3 py-2 border-b border-alf-border shrink-0 bg-alf-canvas">
        <div className="font-mono text-sm text-slate-100">{selectedTicket.filename}</div>
        <div className="flex gap-2 mt-1 flex-wrap">
          {selectedTicket.status && (
            <span className={`text-xs font-mono ${statusColor(selectedTicket.status)}`}>
              {selectedTicket.status}
            </span>
          )}
          {selectedTicket.epic && (
            <span className="text-xs text-purple-400/60 font-mono">{selectedTicket.epic}</span>
          )}
          {selectedTicket.tags?.map(tag => (
            <span key={tag} className="text-xs text-sky-400/50 font-mono">{tag}</span>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 prose prose-invert prose-sm max-w-none bg-alf-bg"
           data-alf-ctx-ticket-id={selectedTicket.id}
           data-alf-ctx-ticket-title={selectedTicket.title}>
        <MarkdownRenderer>{selectedTicket.content}</MarkdownRenderer>
      </div>
    </Panel>
  );
}

export function TicketsPanel({ repo }: { repo: string }) {
  const setTickets = useTicketsStore(s => s.setTickets);

  usePanelInit((request) => {
    setTickets([]);
    request<{ tickets: TicketMeta[] }>({ type: "tickets/list", repo })
      .then(res => setTickets(res.tickets))
      .catch(console.error);
  });

  return (
    <SidebarLayout
      defaultSize={35}
      minSize={20}
      sidebar={<TicketList repo={repo} />}
      main={<TicketDetail />}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: string): string {
  switch (status) {
    case "open":        return "text-emerald-500/70";
    case "in-progress": return "text-amber-400/70";
    case "future":      return "text-sky-400/60";
    case "done":        return "text-slate-500";
    default:            return "text-slate-500";
  }
}
