import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import type { Worktree, GitCommit } from "@alf/types";
import { handle, type Reply } from "../../core/dispatch.js";
import { REPOS_ROOT } from "../../core/config.js";

const execFileAsync = promisify(execFile);

// Handlers at top — helpers below are hoisted (function declarations).
export class GitModule {
  @handle("git/worktrees")
  static async worktrees(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    if (!repo) { reply({ type: "error", error: "Missing repo" }); return; }
    try {
      const raw = await git(repoPath(repo), ["worktree", "list", "--porcelain"]);
      reply({ type: "git/worktrees", worktrees: parseWorktrees(raw) });
    } catch {
      reply({ type: "git/worktrees", worktrees: [] });
    }
  }

  @handle("git/changed-files")
  static async changedFiles(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    if (!repo) { reply({ type: "error", error: "Missing repo" }); return; }
    try {
      // --porcelain covers modified, staged, untracked (??), deleted, etc.
      // Untracked directories show as "?? dir/" — expand to individual files.
      const cwd = repoPath(repo);
      const raw = await git(cwd, ["status", "--porcelain"]);
      const files: string[] = [];
      for (const line of raw.split("\n").filter(Boolean)) {
        const entry = line.slice(3).trim();
        if (!entry || entry === "/dev/null") continue;
        if (entry.endsWith("/")) {
          // Untracked directory — expand to individual files
          const expanded = await git(cwd, ["ls-files", "--others", "--exclude-standard", "--", entry]);
          for (const f of expanded.split("\n").filter(Boolean)) files.push(f);
        } else {
          files.push(entry);
        }
      }
      reply({ type: "git/changed-files", files });
    } catch {
      reply({ type: "git/changed-files", files: [] });
    }
  }

  @handle("git/diff")
  static async diff(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const file = msg.file as string | undefined;
    const branch = msg.branch as string | undefined;
    if (!repo) { reply({ type: "error", error: "Missing repo" }); return; }
    const diff = await buildDiff(repoPath(repo), file ?? null, branch ?? null);
    reply({ type: "git/diff", diff, file: file ?? null });
  }

  /** List recent commits (subject + date, no author). */
  @handle("git/commits")
  static async commits(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const limit = Number(msg.limit ?? 20);
    if (!repo) { reply({ type: "error", error: "Missing repo" }); return; }
    try {
      const raw = await git(repoPath(repo), [
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

  /** List files changed in a single commit (sha^..sha). */
  @handle("git/commit/diff/files")
  static async commitDiffFiles(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const sha = msg.sha as string | undefined;
    if (!repo || !sha) { reply({ type: "error", error: "Missing repo or sha" }); return; }
    try {
      const raw = await git(repoPath(repo), ["diff", "--name-only", `${sha}^..${sha}`]);
      const files = raw.split("\n").filter(Boolean);
      reply({ type: "git/commit/diff/files", files, sha });
    } catch {
      reply({ type: "git/commit/diff/files", files: [], sha: sha ?? "" });
    }
  }

  /** Unified diff for a commit (sha^..sha), optionally filtered to a single file. */
  @handle("git/commit/diff")
  static async commitDiff(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const sha = msg.sha as string | undefined;
    const file = msg.file as string | undefined;
    if (!repo || !sha) { reply({ type: "error", error: "Missing repo or sha" }); return; }
    try {
      const args = file
        ? ["diff", "--no-color", "-U5", `${sha}^..${sha}`, "--", file]
        : ["diff", "--no-color", "-U5", `${sha}^..${sha}`];
      const diff = await git(repoPath(repo), args);
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

async function buildDiff(cwd: string, file: string | null, branch: string | null): Promise<string> {
  if (file) {
    // Untracked file: diff against /dev/null to show full content as additions.
    if (await isUntracked(cwd, file)) return await untrackedDiff(cwd, file);
    const args = ["diff", "--no-color", "-U5", branch ?? "HEAD", "--", file];
    return await git(cwd, args);
  }
  // All changes: everything vs HEAD + untracked files as new-file diffs.
  const tracked = await git(cwd, ["diff", "--no-color", "-U5", "HEAD"]);
  const untrackedFiles = (await git(cwd, ["ls-files", "--others", "--exclude-standard"]))
    .split("\n").filter(Boolean);
  const newFiles = await Promise.all(untrackedFiles.map(f => untrackedDiff(cwd, f)));
  return [tracked, ...newFiles].filter(Boolean).join("\n");
}

async function isUntracked(cwd: string, file: string): Promise<boolean> {
  return (await git(cwd, ["status", "--porcelain", "--", file])).trimStart().startsWith("??");
}

// --no-index exits 1 when files differ (always the case vs /dev/null)
// so stdout comes from the rejected error object.
async function untrackedDiff(cwd: string, file: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--no-index", "--no-color", "-U5", "/dev/null", file], { cwd, encoding: "utf8" });
    return stdout ?? "";
  } catch (err: unknown) {
    // exit code 1 means files differ — stdout is on the error object
    const e = err as { stdout?: string };
    return e.stdout ?? "";
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
    return stdout ?? "";
  } catch {
    return "";
  }
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
