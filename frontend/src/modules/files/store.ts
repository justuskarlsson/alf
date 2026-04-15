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
    console.log("[filesStore.listFiles] called, repo:", repo);
    set({ files: [], selectedFile: null, fileContent: null });
    request<{ files: FileEntry[] }>({ type: "files/list", repo })
      .then(res => { console.log("[filesStore.listFiles] response, repo:", repo, "count:", res.files.length); set({ files: res.files }); })
      .catch(e => console.error("[filesStore.listFiles] error, repo:", repo, e));
  },
}));
