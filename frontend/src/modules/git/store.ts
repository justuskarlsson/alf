import { create } from "zustand";

export interface Worktree {
  path: string;
  head: string;
  branch: string;
  bare: boolean;
}

interface GitStore {
  worktrees: Worktree[];
  setWorktrees: (worktrees: Worktree[]) => void;
  diff: string | null;
  setDiff: (diff: string | null) => void;
}

export const useGitStore = create<GitStore>((set) => ({
  worktrees: [],
  setWorktrees: (worktrees) => set({ worktrees }),
  diff: null,
  setDiff: (diff) => set({ diff }),
}));
