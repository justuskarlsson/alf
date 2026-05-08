import fs from "fs";
import path from "path";
import { handle, type Reply } from "../../core/dispatch.js";
import { REPOS_ROOT } from "../../core/config.js";
import { getDb } from "../../core/db/index.js";

function isWorktree(dirPath: string): boolean {
  try {
    return fs.statSync(path.join(dirPath, ".git")).isFile();
  } catch {
    return false;
  }
}

/**
 * List repos sorted by most recent session activity.
 * Repos with sessions come first (most recent first),
 * repos without sessions follow in case-insensitive alpha order.
 */
function listRepos(): string[] {
  let dirs: string[];
  try {
    dirs = fs.readdirSync(REPOS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory() && !isWorktree(path.join(REPOS_ROOT, d.name)))
      .map(d => d.name);
  } catch {
    return [];
  }

  // Query latest session timestamp per repo path
  let activityMap: Map<string, number>;
  try {
    const rows = getDb().prepare(`
      SELECT r.path, MAX(s.updated_at) as last_activity
      FROM repos r
      JOIN sessions s ON s.repo_id = r.id
      GROUP BY r.id
    `).all() as { path: string; last_activity: number }[];
    activityMap = new Map(rows.map(r => [r.path, r.last_activity]));
  } catch {
    activityMap = new Map();
  }

  return dirs.sort((a, b) => {
    const aTime = activityMap.get(a) ?? 0;
    const bTime = activityMap.get(b) ?? 0;
    // Both have activity → most recent first
    if (aTime && bTime) return bTime - aTime;
    // One has activity → it goes first
    if (aTime) return -1;
    if (bTime) return 1;
    // Neither has activity → case-insensitive alpha
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
}

export class ReposModule {
  @handle("repos/list")
  static list(_msg: Record<string, unknown>, reply: Reply) {
    reply({ type: "repos/list", repos: listRepos() });
  }
}
