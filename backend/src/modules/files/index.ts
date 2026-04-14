import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { FileEntry } from "@alf/types";
import { handle, type Reply } from "../../core/dispatch.js";

const REPOS_ROOT = process.env.REPOS_ROOT ?? `${process.env.HOME}/repos`;

// Sorted flat list from git ls-files — respects .gitignore.
// Reconstructs dir entries from file paths.
function listFilesGit(repoPath: string): FileEntry[] {
  const output = execSync("git ls-files", { cwd: repoPath, encoding: "utf8" });
  const filePaths = output.trim().split("\n").filter(Boolean).sort();

  const dirSet = new Set<string>();
  const fileEntries: FileEntry[] = [];

  for (const fp of filePaths) {
    const parts = fp.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join("/"));
    }
    fileEntries.push({ name: parts[parts.length - 1], path: fp, isDir: false });
  }

  const dirEntries: FileEntry[] = [...dirSet].map(dp => ({
    name: dp.split("/").pop()!,
    path: dp,
    isDir: true,
  }));

  // localeCompare: 'src' < 'src/file' so dirs naturally sort before their children
  return [...dirEntries, ...fileEntries].sort((a, b) => a.path.localeCompare(b.path));
}

// Fallback naive walk — skips common heavy dirs
const SKIP = new Set([".git", "node_modules", "dist", ".next", "__pycache__", ".venv"]);

function listFilesNaive(repoPath: string): FileEntry[] {
  const entries: FileEntry[] = [];
  function walk(dir: string, rel: string) {
    let items: fs.Dirent[];
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(item.name) || item.name.startsWith(".")) continue;
      const itemRel = rel ? `${rel}/${item.name}` : item.name;
      entries.push({ name: item.name, path: itemRel, isDir: item.isDirectory() });
      if (item.isDirectory()) walk(path.join(dir, item.name), itemRel);
    }
  }
  walk(repoPath, "");
  return entries;
}

function listFiles(repo: string, useGit = true): FileEntry[] {
  const repoPath = path.join(REPOS_ROOT, repo);
  if (useGit) {
    try { return listFilesGit(repoPath); } catch { /* fall through */ }
  }
  return listFilesNaive(repoPath);
}

export class FilesModule {
  @handle("files/list")
  static list(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    if (!repo) { reply({ type: "error", error: "Missing repo" }); return; }
    reply({ type: "files/list", files: listFiles(repo) });
  }

  @handle("files/get")
  static get(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const filePath = msg.path as string | undefined;
    if (!repo || !filePath) { reply({ type: "error", error: "Missing repo or path" }); return; }

    const repoRoot = path.join(REPOS_ROOT, repo);
    const fullPath = path.resolve(repoRoot, filePath);
    if (!fullPath.startsWith(repoRoot + path.sep) && fullPath !== repoRoot) {
      reply({ type: "error", error: "Invalid path" }); return;
    }

    try {
      const content = fs.readFileSync(fullPath, "utf8");
      reply({ type: "files/get", content, path: filePath });
    } catch {
      try {
        const content = fs.readFileSync(fullPath).toString("base64");
        reply({ type: "files/get", content, isBinary: true, path: filePath });
      } catch {
        reply({ type: "error", error: "Cannot read file" });
      }
    }
  }
}
