import { create } from "zustand";
import type { TicketMeta, TicketFull } from "@alf/types";

export type { TicketMeta, TicketFull };

interface TicketsStore {
  tickets: TicketMeta[];
  setTickets: (tickets: TicketMeta[]) => void;
  selectedTicket: TicketFull | null;
  setSelectedTicket: (ticket: TicketFull | null) => void;
}

export const useTicketsStore = create<TicketsStore>((set) => ({
  tickets: [],
  setTickets: (tickets) => set({ tickets }),
  selectedTicket: null,
  setSelectedTicket: (ticket) => set({ selectedTicket: ticket }),
}));
