import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { FileEntry } from "@alf/types";
import { handle, type Reply } from "../../core/dispatch.js";
import { ALF_DIR, REPOS_ROOT } from "../../core/config.js";

// Handlers at top — helper functions below are hoisted (function declarations).
export class FilesModule {
  @handle("files/list")
  static list(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const showHidden = msg.showHidden === true;
    if (!repo) { reply({ type: "error", error: "Missing repo" }); return; }
    reply({ type: "files/list", files: listFiles(repo, !showHidden) });
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
      // Binary files (images, etc.) must be read as base64 — readFileSync("utf8")
      // silently mangles binary data instead of throwing.
      if (isBinaryExt(filePath)) {
        const content = fs.readFileSync(fullPath).toString("base64");
        reply({ type: "files/get", content, isBinary: true, path: filePath });
        return;
      }
      const content = fs.readFileSync(fullPath, "utf8");
      reply({ type: "files/get", content, path: filePath });
    } catch {
      try {
        const content = fs.readFileSync(fullPath).toString("base64");
        reply({ type: "files/get", content, isBinary: true, path: filePath });
      } catch {
        console.error("[files/get] Cannot read file:", fullPath, "repo:", repo, "path:", filePath);
        reply({ type: "error", error: "Cannot read file" });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers (function declarations — hoisted, safe to call from class above)
// ---------------------------------------------------------------------------

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

// Fallback naive walk — skips common heavy dirs and dot-files/dirs
const SKIP = new Set([".git", "node_modules", "dist", ".next", "__pycache__", ".venv"]);
// Dot-dirs allowed in "show hidden" mode
const DOT_ALLOW = new Set([ALF_DIR]);

function listFilesNaive(repoPath: string): FileEntry[] {
  const entries: FileEntry[] = [];
  function walk(dir: string, rel: string) {
    let items: fs.Dirent[];
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(item.name)) continue;
      if (item.name.startsWith(".") && !DOT_ALLOW.has(item.name)) continue;
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

const BINARY_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tiff", "tif",
  "pdf", "zip", "gz", "tar", "7z", "rar",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp3", "mp4", "wav", "ogg", "webm", "flac",
  "exe", "dll", "so", "dylib", "bin",
  "sqlite", "db",
]);

function isBinaryExt(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return BINARY_EXTS.has(ext);
}
