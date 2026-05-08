import { create } from "zustand";
import type { TicketMeta, TicketFull } from "@alf/types";

export type { TicketMeta, TicketFull };

type WsRequest = <T>(msg: Record<string, unknown>) => Promise<T>;

interface TicketsStore {
  tickets: TicketMeta[];
  setTickets: (tickets: TicketMeta[]) => void;
  selectedTicket: TicketFull | null;
  selectTicket: (id: string, repo: string, request: WsRequest) => void;
  /** Spawn a new agent session from the currently selected ticket. */
  spawnSession: (repo: string, request: WsRequest) => void;
}

export const useTicketsStore = create<TicketsStore>((set, get) => ({
  tickets: [],
  setTickets: (tickets) => set({ tickets }),
  selectedTicket: null,
  selectTicket: (id, repo, request) => {
    request<{ ticket: TicketFull }>({ type: "tickets/get", repo, id })
      .then(res => set({ selectedTicket: res.ticket }))
      .catch(console.error);
  },
  spawnSession: (repo, request) => {
    const ticket = get().selectedTicket;
    if (!ticket) return;

    // 1. Create session
    request<{ sessionId: string }>({ type: "agent/session/create", repo })
      .then(res => {
        const sessionId = res.sessionId;
        const title = `${ticket.id}: ${ticket.title}`;
        // 2. Set session title to ticket reference
        request<{ ok: boolean }>({ type: "agent/session/update", sessionId, title }).catch(console.error);
        // 3. Link session back to ticket frontmatter
        request<{ ok: boolean; ticket: TicketFull }>({
          type: "tickets/link-session", repo, id: ticket.id, sessionId,
        })
          .then(res => {
            // Update selected ticket + list entry with session link
            set(s => ({
              selectedTicket: res.ticket,
              tickets: s.tickets.map(t => t.id === ticket.id ? { ...t, session: sessionId } : t),
            }));
          })
          .catch(console.error);
        // 4. Send initial prompt with ticket context
        const prompt = buildTicketPrompt(ticket);
        request<{ sessionId: string; status: string }>({
          type: "agent/message", sessionId, prompt,
        }).catch(console.error);
      })
      .catch(console.error);
  },
}));

/** Build a template prompt from ticket metadata + content. */
function buildTicketPrompt(ticket: TicketFull): string {
  const parts = [
    `Work on ticket **${ticket.id}**: ${ticket.title}`,
    "",
    ticket.content,
  ];
  return parts.join("\n");
}
