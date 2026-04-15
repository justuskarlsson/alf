import { create } from "zustand";

// Global workspace state — active repo + known repo list.
// Lives above individual panel stores; panels read repo from here.
interface GlobalStore {
  repo: string | null;
  repos: string[];
  setRepo: (repo: string) => void;
  setRepos: (repos: string[]) => void;
}

export const useGlobalStore = create<GlobalStore>((set) => ({
  repo: null,
  repos: [],
  setRepo: (repo) => set({ repo }),
  setRepos: (repos) => set({ repos }),
}));
