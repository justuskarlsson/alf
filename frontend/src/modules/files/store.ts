import { create } from "zustand";
import type { FileEntry } from "@alf/types";
import { storage } from "../../core/storage";

export type { FileEntry };

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
  setRepo: (repo) => set({ repo, starred: storage.get<string[]>(`starred:${repo}`) ?? [] }),
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
    storage.set(`starred:${s.repo}`, starred);
    return { starred };
  }),
  unstar: (filePath) => set((s) => {
    if (!s.repo) return s;
    const starred = s.starred.filter(p => p !== filePath);
    storage.set(`starred:${s.repo}`, starred);
    return { starred };
  }),
}));
