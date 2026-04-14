import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useRelay } from "../lib/RelayProvider";
import { useRepoStore, type FileEntry } from "../store/repoStore";
import { FileListPanel } from "../components/FileListPanel";

export function RepoPage() {
  const { repo } = useParams<{ repo: string }>();
  const { request, isConnected } = useRelay();
  const { files, setFiles } = useRepoStore();

  useEffect(() => {
    if (!isConnected || !repo) return;
    setFiles([]);
    request<{ files: FileEntry[] }>({ type: "files/list", repo })
      .then((res) => setFiles(res.files))
      .catch(console.error);
  }, [isConnected, repo]);

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Sidebar panel */}
      <div className="w-64 border-r border-white/10 flex flex-col">
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-white/10">
          {repo}
        </div>
        <FileListPanel files={files} />
      </div>

      {/* Main area — placeholder for future panels */}
      <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
        Select a file
      </div>
    </div>
  );
}
