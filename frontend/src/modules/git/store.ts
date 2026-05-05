import { create } from "zustand";
import type { Worktree, GitCommit } from "@alf/types";
import { ScopedRequestCancelledError } from "../../core/useScopedRequest";

export type { Worktree, GitCommit };

type WsRequest = <T>(msg: Record<string, unknown>) => Promise<T>;

/** "unstaged" = working-tree diff; anything else = that commit SHA */
export type DiffBase = "unstaged" | string;

interface GitStore {
  worktrees: Worktree[];
  setWorktrees: (worktrees: Worktree[]) => void;
  selectedWorktree: Worktree | null;
  setSelectedWorktree: (wt: Worktree | null) => void;
  changedFiles: string[];
  changedFilesLoading: boolean;
  selectedDiffFile: string | null;
  diff: string | null;
  loadChangedFiles: (repo: string, request: WsRequest) => void;
  loadDiff: (repo: string, file: string | null, request: WsRequest) => void;

  // Commit history
  commits: GitCommit[];
  diffBase: DiffBase;
  commitDiffFiles: string[];
  loadCommits: (repo: string, request: WsRequest) => void;
  selectDiffBase: (base: DiffBase, repo: string, request: WsRequest) => void;
  loadCommitDiff: (sha: string, file: string | null, repo: string, request: WsRequest) => void;
}

export const useGitStore = create<GitStore>((set) => ({
  worktrees: [],
  setWorktrees: (worktrees) => set({ worktrees }),
  selectedWorktree: null,
  setSelectedWorktree: (wt) => set({ selectedWorktree: wt }),
  changedFiles: [],
  changedFilesLoading: false,
  selectedDiffFile: null,
  diff: null,
  loadChangedFiles: (repo, request) => {
    set({ changedFilesLoading: true });
    request<{ files: string[] }>({ type: "git/changed-files", repo })
      .then(res => set({ changedFiles: res.files, changedFilesLoading: false }))
      .catch((err) => {
        set({ changedFilesLoading: false });
        if (!(err instanceof ScopedRequestCancelledError)) console.error(err);
      });
  },
  loadDiff: (repo, file, request) => {
    set({ diff: null, selectedDiffFile: file });
    const msg: Record<string, unknown> = { type: "git/diff", repo };
    if (file) msg.file = file;
    request<{ diff: string }>(msg)
      .then(res => set({ diff: res.diff }))
      .catch((err) => {
        if (!(err instanceof ScopedRequestCancelledError)) console.error(err);
      });
  },

  // Commit history
  commits: [],
  diffBase: "unstaged",
  commitDiffFiles: [],
  loadCommits: (repo, request) => {
    request<{ commits: GitCommit[] }>({ type: "git/commits", repo })
      .then(res => set({ commits: res.commits }))
      .catch((err) => {
        if (!(err instanceof ScopedRequestCancelledError)) console.error(err);
      });
  },
  selectDiffBase: (base, repo, request) => {
    set({ diffBase: base, selectedDiffFile: null, diff: null, commitDiffFiles: [] });
    if (base === "unstaged") {
      // Reuse existing loadChangedFiles + loadDiff for the all-changes view
      request<{ files: string[] }>({ type: "git/changed-files", repo })
        .then(res => set({ changedFiles: res.files }))
        .catch((err) => {
          if (!(err instanceof ScopedRequestCancelledError)) console.error(err);
        });
      request<{ diff: string }>({ type: "git/diff", repo })
        .then(res => set({ diff: res.diff }))
        .catch((err) => {
          if (!(err instanceof ScopedRequestCancelledError)) console.error(err);
        });
    } else {
      request<{ files: string[] }>({ type: "git/commit/diff/files", repo, sha: base })
        .then(res => set({ commitDiffFiles: res.files }))
        .catch((err) => {
          if (!(err instanceof ScopedRequestCancelledError)) console.error(err);
        });
      request<{ diff: string }>({ type: "git/commit/diff", repo, sha: base })
        .then(res => set({ diff: res.diff }))
        .catch((err) => {
          if (!(err instanceof ScopedRequestCancelledError)) console.error(err);
        });
    }
  },
  loadCommitDiff: (sha, file, repo, request) => {
    set({ diff: null, selectedDiffFile: file });
    request<{ diff: string }>({ type: "git/commit/diff", repo, sha, ...(file ? { file } : {}) })
      .then(res => set({ diff: res.diff }))
      .catch((err) => {
        if (!(err instanceof ScopedRequestCancelledError)) console.error(err);
      });
  },
}));
