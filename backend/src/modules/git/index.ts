import { execSync } from "child_process";
import path from "path";
import type { Worktree } from "@alf/types";
import { handle, type Reply } from "../../core/dispatch.js";

const REPOS_ROOT = process.env.REPOS_ROOT ?? `${process.env.HOME}/repos`;

// Handlers at top — helpers below are hoisted (function declarations).
export class GitModule {
  @handle("git/worktrees")
  static worktrees(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    if (!repo) { reply({ type: "error", error: "Missing repo" }); return; }
    try {
      const raw = execSync("git worktree list --porcelain", { cwd: repoPath(repo), encoding: "utf8" });
      reply({ type: "git/worktrees", worktrees: parseWorktrees(raw) });
    } catch {
      reply({ type: "git/worktrees", worktrees: [] });
    }
  }

  @handle("git/changed-files")
  static changedFiles(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    if (!repo) { reply({ type: "error", error: "Missing repo" }); return; }
    try {
      const raw = execSync("git diff --name-only", { cwd: repoPath(repo), encoding: "utf8" });
      const files = raw.split("\n").filter(Boolean);
      reply({ type: "git/changed-files", files });
    } catch {
      reply({ type: "git/changed-files", files: [] });
    }
  }

  @handle("git/diff")
  static diff(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const file = msg.file as string | undefined;
    const branch = msg.branch as string | undefined;
    if (!repo) { reply({ type: "error", error: "Missing repo" }); return; }
    try {
      const args = ["git", "diff", "--no-color", "-U5"];
      if (branch) args.push(branch);
      if (file) args.push("--", file);
      const diff = execSync(args.join(" "), { cwd: repoPath(repo), encoding: "utf8" });
      reply({ type: "git/diff", diff, file: file ?? null });
    } catch {
      reply({ type: "git/diff", diff: "", file: file ?? null });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers (function declarations — hoisted, safe to call from class above)
// ---------------------------------------------------------------------------

function repoPath(repo: string): string {
  return path.join(REPOS_ROOT, repo);
}

function parseWorktrees(raw: string): Worktree[] {
  const worktrees: Worktree[] = [];
  let current: Partial<Worktree> = {};
  for (const line of raw.split("\n")) {
    if (line === "") {
      if (current.path) worktrees.push({ bare: false, head: "", branch: "", ...current } as Worktree);
      current = {};
    } else if (line.startsWith("worktree ")) current.path = line.slice(9);
    else if (line.startsWith("HEAD "))      current.head = line.slice(5);
    else if (line.startsWith("branch "))   current.branch = line.slice(7).replace("refs/heads/", "");
    else if (line === "bare")              current.bare = true;
  }
  if (current.path) worktrees.push({ bare: false, head: "", branch: "", ...current } as Worktree);
  return worktrees;
}
