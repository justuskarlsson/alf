import { create } from "zustand";

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

interface FilesStore {
  files: FileEntry[];
  setFiles: (files: FileEntry[]) => void;
}

export const useFilesStore = create<FilesStore>((set) => ({
  files: [],
  setFiles: (files) => set({ files }),
}));
