import { useFilesStore } from "./store";

export function FileListPanel() {
  const files = useFilesStore(s => s.files);

  if (files.length === 0) return <p className="p-4 text-gray-500 text-sm">Loading…</p>;

  return (
    <div className="overflow-y-auto h-full py-2">
      {files.map((f) => {
        const depth = f.path.split("/").length - 1;
        return (
          <div
            key={f.path}
            className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-white/5 cursor-default select-none"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <span className="text-gray-600 text-xs w-3 text-center">
              {f.isDir ? "▸" : "·"}
            </span>
            <span className={`font-mono text-sm truncate ${f.isDir ? "text-gray-200" : "text-gray-400"}`}>
              {f.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
