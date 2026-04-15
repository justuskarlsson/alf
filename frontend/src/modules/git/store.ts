import { create } from "zustand";
import type { Worktree } from "@alf/types";

export type { Worktree };

type WsRequest = <T>(msg: Record<string, unknown>) => Promise<T>;

interface GitStore {
  worktrees: Worktree[];
  setWorktrees: (worktrees: Worktree[]) => void;
  selectedWorktree: Worktree | null;
  setSelectedWorktree: (wt: Worktree | null) => void;
  changedFiles: string[];
  selectedDiffFile: string | null;
  diff: string | null;
  loadChangedFiles: (repo: string, request: WsRequest) => void;
  loadDiff: (repo: string, file: string | null, request: WsRequest) => void;
}

export const useGitStore = create<GitStore>((set) => ({
  worktrees: [],
  setWorktrees: (worktrees) => set({ worktrees }),
  selectedWorktree: null,
  setSelectedWorktree: (wt) => set({ selectedWorktree: wt }),
  changedFiles: [],
  selectedDiffFile: null,
  diff: null,
  loadChangedFiles: (repo, request) => {
    set({ changedFiles: [] });
    request<{ files: string[] }>({ type: "git/changed-files", repo })
      .then(res => set({ changedFiles: res.files }))
      .catch(console.error);
  },
  loadDiff: (repo, file, request) => {
    set({ diff: null, selectedDiffFile: file });
    const msg: Record<string, unknown> = { type: "git/diff", repo };
    if (file) msg.file = file;
    request<{ diff: string }>(msg)
      .then(res => set({ diff: res.diff }))
      .catch(console.error);
  },
}));
