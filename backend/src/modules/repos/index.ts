import fs from "fs";
import path from "path";
import { handle, type Reply } from "../../core/dispatch.js";

const REPOS_ROOT = process.env.REPOS_ROOT ?? `${process.env.HOME}/repos`;

function isWorktree(dirPath: string): boolean {
  try {
    return fs.statSync(path.join(dirPath, ".git")).isFile();
  } catch {
    return false;
  }
}

function listRepos(): string[] {
  try {
    return fs.readdirSync(REPOS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory() && !isWorktree(path.join(REPOS_ROOT, d.name)))
      .map(d => d.name)
      .sort();
  } catch {
    return [];
  }
}

export class ReposModule {
  @handle("repos/list")
  static list(_msg: Record<string, unknown>, reply: Reply) {
    reply({ type: "repos/list", repos: listRepos() });
  }
}
