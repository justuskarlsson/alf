import { create } from "zustand";

export interface TicketMeta {
  id: string;
  title: string;
  tags?: string[];
  epic?: string;
  status?: string;
  created?: string;
}

export interface TicketFull extends TicketMeta {
  content: string;
}

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
