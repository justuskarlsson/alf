import fs from "fs";
import { handle, type Reply } from "../../core/dispatch.js";

const REPOS_ROOT = process.env.REPOS_ROOT ?? `${process.env.HOME}/repos`;

function listRepos(): string[] {
  try {
    return fs.readdirSync(REPOS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
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
