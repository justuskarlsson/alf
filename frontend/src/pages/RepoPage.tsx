import { useRelay } from "../core/RelayProvider";
import { useOnConnect } from "../core/useOnConnect";
import { useFilesStore, type FileEntry } from "../modules/files/store";
import { FileListPanel } from "../modules/files/FileListPanel";
import { PanelGrid } from "../panels/PanelGrid";

interface Props {
  repo: string;
}

// Note: RepoPage receives repo as a prop (not useParams) so the parent can set
// key={repo} and force a full re-mount on repo change — avoiding useEffect deps.
export function RepoPage({ repo }: Props) {
  const { request } = useRelay();
  const { setFiles } = useFilesStore();

  useOnConnect(() => {
    setFiles([]);
    request<{ files: FileEntry[] }>({ type: "files/list", repo })
      .then(res => setFiles(res.files))
      .catch(console.error);
  });

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-white/10 font-mono">
        {repo}
      </div>
      <div className="flex-1 overflow-hidden">
        <PanelGrid panels={[
          { id: "files", content: <FileListPanel />, defaultSize: 20, minSize: 12 },
          { id: "main", content: (
            <div className="h-full flex items-center justify-center text-gray-600 text-sm">
              Select a file
            </div>
          )},
        ]} />
      </div>
    </div>
  );
}
