import { create } from "zustand";

interface ReposStore {
  repos: string[];
  setRepos: (repos: string[]) => void;
}

export const useReposStore = create<ReposStore>((set) => ({
  repos: [],
  setRepos: (repos) => set({ repos }),
}));
