import fs from "fs";
import path from "path";
import { register } from "../../core/dispatch.js";

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

register("repos/list", (_msg, reply) => {
  reply({ type: "repos/list", repos: listRepos() });
});
