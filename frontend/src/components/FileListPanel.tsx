import type { FileEntry } from "../store/repoStore";

interface Props {
  files: FileEntry[];
}

export function FileListPanel({ files }: Props) {
  if (files.length === 0) return <p className="p-4 text-gray-400">Loading…</p>;

  return (
    <div className="overflow-y-auto h-full">
      <ul className="py-2">
        {files.map((f) => {
          const depth = f.path.split("/").length - 1;
          return (
            <li
              key={f.path}
              className="flex items-center gap-2 px-3 py-0.5 hover:bg-white/5 cursor-default"
              style={{ paddingLeft: `${depth * 12 + 12}px` }}
            >
              <span className="text-gray-500 text-xs select-none">
                {f.isDir ? "▸" : "·"}
              </span>
              <span className={`font-mono text-sm ${f.isDir ? "text-gray-200" : "text-gray-400"}`}>
                {f.name}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
