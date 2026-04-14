import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useShallow } from "zustand/react/shallow";
import type { TicketFull } from "@alf/types";
import { useRelay } from "../../core/RelayProvider";
import { useOnConnect } from "../../core/useOnConnect";
import { Panel, SidebarLayout, EmptyState } from "../../panels/Panel";
import { useTicketsStore, type TicketMeta } from "./store";

// ---------------------------------------------------------------------------
// Ticket list
// ---------------------------------------------------------------------------

function TicketList({ repo }: { repo: string }) {
  const { request } = useRelay();
  const { tickets, selectedTicket, setSelectedTicket } = useTicketsStore(useShallow(s => ({
    tickets: s.tickets,
    selectedTicket: s.selectedTicket,
    setSelectedTicket: s.setSelectedTicket,
  })));

  function openTicket(meta: TicketMeta) {
    request<{ ticket: TicketFull }>({ type: "tickets/get", repo, id: meta.id })
      .then(res => setSelectedTicket(res.ticket))
      .catch(console.error);
  }

  if (tickets.length === 0) return <EmptyState message="No tickets found." />;

  return (
    <Panel>
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-white/5">
          {tickets.map(t => (
            <div
              key={t.id}
              className={`px-3 py-2 cursor-default select-none hover:bg-alf-surface
                ${selectedTicket?.id === t.id ? "bg-white/10" : ""}`}
              onClick={() => openTicket(t)}
            >
              <div className="font-mono text-sm text-gray-200 truncate">{t.title}</div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="font-mono text-xs text-gray-600">{t.id}</span>
                {t.status && (
                  <span className={`text-xs font-mono
                    ${t.status === "open" ? "text-green-500/70" : "text-gray-500"}`}>
                    {t.status}
                  </span>
                )}
                {t.epic && <span className="text-xs text-purple-400/60 font-mono">{t.epic}</span>}
                {t.tags?.map(tag => (
                  <span key={tag} className="text-xs text-blue-400/50 font-mono">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Ticket detail
// ---------------------------------------------------------------------------

function TicketDetail() {
  const selectedTicket = useTicketsStore(s => s.selectedTicket);

  if (!selectedTicket) return <EmptyState message="Select a ticket" />;

  return (
    <Panel>
      <div className="px-3 py-2 border-b border-alf-border shrink-0">
        <div className="font-mono text-sm text-gray-100">{selectedTicket.title}</div>
        <div className="flex gap-2 mt-1 flex-wrap">
          <span className="font-mono text-xs text-gray-600">{selectedTicket.id}</span>
          {selectedTicket.status && (
            <span className={`text-xs font-mono
              ${selectedTicket.status === "open" ? "text-green-500/70" : "text-gray-500"}`}>
              {selectedTicket.status}
            </span>
          )}
          {selectedTicket.epic && (
            <span className="text-xs text-purple-400/60 font-mono">{selectedTicket.epic}</span>
          )}
          {selectedTicket.tags?.map(tag => (
            <span key={tag} className="text-xs text-blue-400/50 font-mono">{tag}</span>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 prose prose-invert prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {selectedTicket.content}
        </ReactMarkdown>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function TicketsPanel({ repo }: { repo: string }) {
  const { request } = useRelay();
  const setTickets = useTicketsStore(s => s.setTickets);

  useOnConnect(() => {
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
