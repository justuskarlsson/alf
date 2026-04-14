import { create } from "zustand";
import type { Worktree } from "@alf/types";

export type { Worktree };

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
