import { execSync, spawnSync } from "child_process";
import path from "path";
import type { Worktree, GitCommit } from "@alf/types";
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
      // --porcelain covers modified, staged, untracked (??), deleted, etc.
      const raw = execSync("git status --porcelain", { cwd: repoPath(repo), encoding: "utf8" });
      const files = raw.split("\n").filter(Boolean).map(line => line.slice(3).trim());
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
    const diff = buildDiff(repoPath(repo), file ?? null, branch ?? null);
    reply({ type: "git/diff", diff, file: file ?? null });
  }

  /** List recent commits (subject + date, no author). */
  @handle("git/commits")
  static commits(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const limit = Number(msg.limit ?? 20);
    if (!repo) { reply({ type: "error", error: "Missing repo" }); return; }
    try {
      const raw = git(repoPath(repo), [
        "log", `--max-count=${limit}`,
        "--format=%H\x1f%s\x1f%ci",
      ]);
      const commits: GitCommit[] = raw.split("\n").filter(Boolean).map(line => {
        const [sha, subject, date] = line.split("\x1f");
        return { sha, subject, date };
      });
      reply({ type: "git/commits", commits });
    } catch {
      reply({ type: "git/commits", commits: [] });
    }
  }

  /** List files changed between a commit SHA and HEAD. */
  @handle("git/commit/diff/files")
  static commitDiffFiles(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const sha = msg.sha as string | undefined;
    if (!repo || !sha) { reply({ type: "error", error: "Missing repo or sha" }); return; }
    try {
      const raw = git(repoPath(repo), ["diff", "--name-only", `${sha}..HEAD`]);
      const files = raw.split("\n").filter(Boolean);
      reply({ type: "git/commit/diff/files", files, sha });
    } catch {
      reply({ type: "git/commit/diff/files", files: [], sha: sha ?? "" });
    }
  }

  /** Unified diff for a single file between a commit SHA and HEAD. */
  @handle("git/commit/diff")
  static commitDiff(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const sha = msg.sha as string | undefined;
    const file = msg.file as string | undefined;
    if (!repo || !sha) { reply({ type: "error", error: "Missing repo or sha" }); return; }
    try {
      const args = file
        ? ["diff", "--no-color", "-U5", `${sha}..HEAD`, "--", file]
        : ["diff", "--no-color", "-U5", `${sha}..HEAD`];
      const diff = git(repoPath(repo), args);
      reply({ type: "git/commit/diff", diff, sha, file: file ?? null });
    } catch {
      reply({ type: "git/commit/diff", diff: "", sha: sha ?? "", file: file ?? null });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers (function declarations — hoisted, safe to call from class above)
// ---------------------------------------------------------------------------

function repoPath(repo: string): string {
  return path.join(REPOS_ROOT, repo);
}

function buildDiff(cwd: string, file: string | null, branch: string | null): string {
  if (file) {
    // Untracked file: diff against /dev/null to show full content as additions.
    if (isUntracked(cwd, file)) return untrackedDiff(cwd, file);
    const args = ["diff", "--no-color", "-U5", branch ?? "HEAD", "--", file];
    return git(cwd, args);
  }
  // All changes: everything vs HEAD + untracked files as new-file diffs.
  const tracked = git(cwd, ["diff", "--no-color", "-U5", "HEAD"]);
  const newFiles = git(cwd, ["ls-files", "--others", "--exclude-standard"])
    .split("\n").filter(Boolean)
    .map(f => untrackedDiff(cwd, f));
  return [tracked, ...newFiles].filter(Boolean).join("\n");
}

function isUntracked(cwd: string, file: string): boolean {
  return git(cwd, ["status", "--porcelain", "--", file]).trimStart().startsWith("??");
}

// spawnSync so file paths with spaces are safe. --no-index exits 1 when files
// differ (always the case vs /dev/null) so stdout is on the error object.
function untrackedDiff(cwd: string, file: string): string {
  const res = spawnSync("git", ["diff", "--no-index", "--no-color", "-U5", "/dev/null", file], { cwd, encoding: "utf8" });
  return res.stdout ?? "";
}

function git(cwd: string, args: string[]): string {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  return res.stdout ?? "";
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
