import { create } from "zustand";

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

function loadStarred(repo: string): string[] {
  try { return JSON.parse(localStorage.getItem(`alf:starred:${repo}`) ?? "[]"); } catch { return []; }
}

interface FilesStore {
  repo: string | null;
  setRepo: (repo: string) => void;
  files: FileEntry[];
  setFiles: (files: FileEntry[]) => void;
  selectedFile: string | null;
  setSelectedFile: (path: string | null) => void;
  fileContent: string | null;
  setFileContent: (content: string | null) => void;
  starred: string[];
  star: (path: string) => void;
  unstar: (path: string) => void;
}

export const useFilesStore = create<FilesStore>((set) => ({
  repo: null,
  setRepo: (repo) => set({ repo, starred: loadStarred(repo) }),
  files: [],
  setFiles: (files) => set({ files }),
  selectedFile: null,
  setSelectedFile: (path) => set({ selectedFile: path }),
  fileContent: null,
  setFileContent: (content) => set({ fileContent: content }),
  starred: [],
  star: (filePath) => set((s) => {
    if (!s.repo || s.starred.includes(filePath)) return s;
    const starred = [...s.starred, filePath];
    localStorage.setItem(`alf:starred:${s.repo}`, JSON.stringify(starred));
    return { starred };
  }),
  unstar: (filePath) => set((s) => {
    if (!s.repo) return s;
    const starred = s.starred.filter(p => p !== filePath);
    localStorage.setItem(`alf:starred:${s.repo}`, JSON.stringify(starred));
    return { starred };
  }),
}));
