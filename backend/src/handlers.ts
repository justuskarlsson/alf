import fs from "fs";
import path from "path";

const REPOS_ROOT = process.env.REPOS_ROOT ?? `${process.env.HOME}/repos`;

export function listRepos(): string[] {
  try {
    return fs.readdirSync(REPOS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();
  } catch {
    return [];
  }
}

export interface FileEntry {
  name: string;
  path: string;  // relative to repo root
  isDir: boolean;
}

export function listFiles(repo: string): FileEntry[] {
  const repoPath = path.join(REPOS_ROOT, repo);
  const entries: FileEntry[] = [];

  function walk(dir: string, relBase: string) {
    let items: fs.Dirent[];
    try { items = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.name.startsWith(".")) continue;
      const rel = relBase ? `${relBase}/${item.name}` : item.name;
      entries.push({ name: item.name, path: rel, isDir: item.isDirectory() });
      if (item.isDirectory()) walk(path.join(dir, item.name), rel);
    }
  }

  walk(repoPath, "");
  return entries;
}
