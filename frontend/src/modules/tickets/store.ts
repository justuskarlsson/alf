import { create } from "zustand";
import type { TicketMeta, TicketFull } from "@alf/types";

export type { TicketMeta, TicketFull };
export type StatusFilter = "all" | "open" | "in-progress" | "future" | "done";

type WsRequest = <T>(msg: Record<string, unknown>) => Promise<T>;

const STORAGE_KEY = "alf-ticket-default-filter";
function loadDefaultFilter(): StatusFilter {
  try { return (localStorage.getItem(STORAGE_KEY) as StatusFilter) ?? "open"; } catch { return "open"; }
}

interface TicketsStore {
  tickets: TicketMeta[];
  setTickets: (tickets: TicketMeta[]) => void;
  selectedTicket: TicketFull | null;
  selectTicket: (id: string, repo: string, request: WsRequest) => void;
  /** Current active filter (persists in store across dashboard switches). */
  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  /** Default filter restored on mount (persisted in localStorage). */
  defaultFilter: StatusFilter;
  setDefaultFilter: (f: StatusFilter) => void;
  /** Spawn a new agent session from the currently selected ticket. */
  spawnSession: (repo: string, request: WsRequest) => void;
}

export const useTicketsStore = create<TicketsStore>((set, get) => ({
  tickets: [],
  setTickets: (tickets) => set({ tickets }),
  selectedTicket: null,
  filter: loadDefaultFilter(),
  setFilter: (filter) => set({ filter }),
  defaultFilter: loadDefaultFilter(),
  setDefaultFilter: (f) => {
    localStorage.setItem(STORAGE_KEY, f);
    set({ defaultFilter: f, filter: f });
  },
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
