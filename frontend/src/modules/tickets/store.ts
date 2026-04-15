import { create } from "zustand";
import type { TicketMeta, TicketFull } from "@alf/types";

export type { TicketMeta, TicketFull };

type WsRequest = <T>(msg: Record<string, unknown>) => Promise<T>;

interface TicketsStore {
  tickets: TicketMeta[];
  setTickets: (tickets: TicketMeta[]) => void;
  selectedTicket: TicketFull | null;
  selectTicket: (id: string, repo: string, request: WsRequest) => void;
}

export const useTicketsStore = create<TicketsStore>((set) => ({
  tickets: [],
  setTickets: (tickets) => set({ tickets }),
  selectedTicket: null,
  selectTicket: (id, repo, request) => {
    request<{ ticket: TicketFull }>({ type: "tickets/get", repo, id })
      .then(res => set({ selectedTicket: res.ticket }))
      .catch(console.error);
  },
}));
