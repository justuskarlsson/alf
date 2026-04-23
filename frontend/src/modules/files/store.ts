import { create } from "zustand";
import type { FileEntry } from "@alf/types";
import { storage } from "../../core/storage";

export type { FileEntry };

type WsRequest = <T>(msg: Record<string, unknown>) => Promise<T>;

interface FilesStore {
  files: FileEntry[];
  setFiles: (files: FileEntry[]) => void;
  selectedFile: string | null;
  setSelectedFile: (path: string | null) => void;
  fileContent: string | null;
  setFileContent: (content: string | null) => void;
  isBinary: boolean;
  setIsBinary: (v: boolean) => void;
  showHidden: boolean;
  setShowHidden: (v: boolean, repo: string, request: WsRequest) => void;
  starred: string[];
  loadStarred: (repo: string) => void;
  star: (repo: string, path: string) => void;
  unstar: (repo: string, path: string) => void;
  listFiles: (repo: string, request: WsRequest) => void;
}

export const useFilesStore = create<FilesStore>((set) => ({
  files: [],
  setFiles: (files) => set({ files }),
  selectedFile: null,
  setSelectedFile: (path) => set({ selectedFile: path }),
  fileContent: null,
  setFileContent: (content) => set({ fileContent: content }),
  isBinary: false,
  setIsBinary: (v) => set({ isBinary: v }),
  showHidden: false,
  setShowHidden: (v, repo, request) => {
    set({ showHidden: v });
    request<{ files: FileEntry[] }>({ type: "files/list", repo, showHidden: v })
      .then(res => set({ files: res.files }))
      .catch(console.error);
  },
  starred: [],
  loadStarred: (repo) => set({ starred: storage.get<string[]>(`starred:${repo}`) ?? [] }),
  star: (repo, filePath) => set((s) => {
    if (s.starred.includes(filePath)) return s;
    const starred = [...s.starred, filePath];
    storage.set(`starred:${repo}`, starred);
    return { starred };
  }),
  unstar: (repo, filePath) => set((s) => {
    const starred = s.starred.filter(p => p !== filePath);
    storage.set(`starred:${repo}`, starred);
    return { starred };
  }),
  listFiles: (repo, request) => {
    const showHidden = useFilesStore.getState().showHidden;
    set({ files: [], selectedFile: null, fileContent: null, isBinary: false });
    request<{ files: FileEntry[] }>({ type: "files/list", repo, showHidden })
      .then(res => set({ files: res.files }))
      .catch(console.error);
  },
}));
