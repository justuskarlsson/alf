import { create } from "zustand";

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

interface RepoStore {
  repos: string[];
  files: FileEntry[];
  setRepos: (repos: string[]) => void;
  setFiles: (files: FileEntry[]) => void;
}

export const useRepoStore = create<RepoStore>((set) => ({
  repos: [],
  files: [],
  setRepos: (repos) => set({ repos }),
  setFiles: (files) => set({ files }),
}));
