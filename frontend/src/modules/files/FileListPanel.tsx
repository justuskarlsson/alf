import { useEffect, useRef, useState } from "react";
import { Tree, type NodeRendererProps } from "react-arborist";
import { useRelay } from "../../core/RelayProvider";
import { useFilesStore, type FileEntry } from "./store";

// ---------------------------------------------------------------------------
// Flat list → tree conversion
// ---------------------------------------------------------------------------

interface TreeNode {
  id: string;
  name: string;
  isDir: boolean;
  children?: TreeNode[];
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const f of files) {
    const node: TreeNode = { id: f.path, name: f.name, isDir: f.isDir, children: f.isDir ? [] : undefined };
    map.set(f.path, node);
    const sep = f.path.lastIndexOf("/");
    const parentPath = sep >= 0 ? f.path.slice(0, sep) : null;
    if (parentPath && map.has(parentPath)) {
      map.get(parentPath)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Starred section
// ---------------------------------------------------------------------------

function StarredSection() {
  const { request } = useRelay();
  const { repo, files, starred, unstar, setSelectedFile, setFileContent } = useFilesStore(s => ({
    repo: s.repo,
    files: s.files,
    starred: s.starred,
    unstar: s.unstar,
    setSelectedFile: s.setSelectedFile,
    setFileContent: s.setFileContent,
  }));
  const [collapsed, setCollapsed] = useState(false);

  const starredEntries = files.filter(f => starred.includes(f.path));
  if (starredEntries.length === 0) return null;

  function openFile(filePath: string) {
    if (!repo) return;
    setSelectedFile(filePath);
    setFileContent(null);
    request<{ content: string }>({ type: "files/get", repo, path: filePath })
      .then(res => setFileContent(res.content))
      .catch(console.error);
  }

  return (
    <div className="border-b border-white/10 shrink-0">
      <button
        className="w-full flex items-center gap-1 px-2 py-1 text-xs text-gray-400 uppercase tracking-wider hover:text-gray-200 font-mono"
        onClick={() => setCollapsed(c => !c)}
      >
        <span className="text-gray-600 w-3 text-center">{collapsed ? "▸" : "▾"}</span>
        Starred
      </button>
      {!collapsed && (
        <div className="pb-1">
          {starredEntries.map(f => (
            <div
              key={f.path}
              className="flex items-start gap-1.5 px-2 py-0.5 hover:bg-white/5 cursor-default select-none"
              onClick={() => !f.isDir && openFile(f.path)}
            >
              <button
                className="shrink-0 mt-0.5 text-xs w-3 text-yellow-500/70 hover:text-yellow-400"
                onClick={(e) => { e.stopPropagation(); unstar(f.path); }}
                title="Unstar"
              >★</button>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-sm text-gray-300 truncate">{f.name}</span>
                {f.path !== f.name && (
                  <span className="font-mono text-xs text-gray-600 truncate">{f.path}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree node
// ---------------------------------------------------------------------------

function FileNode({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const { request } = useRelay();
  const { repo, starred, star, unstar, selectedFile, setSelectedFile, setFileContent } = useFilesStore(s => ({
    repo: s.repo,
    starred: s.starred,
    star: s.star,
    unstar: s.unstar,
    selectedFile: s.selectedFile,
    setSelectedFile: s.setSelectedFile,
    setFileContent: s.setFileContent,
  }));
  const isStarred = starred.includes(node.id);
  const isSelected = selectedFile === node.id;

  function onRowClick() {
    if (node.isInternal) {
      node.toggle();
    } else {
      if (!repo) return;
      setSelectedFile(node.id);
      setFileContent(null);
      request<{ content: string }>({ type: "files/get", repo, path: node.id })
        .then(res => setFileContent(res.content))
        .catch(console.error);
    }
  }

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`flex items-center gap-1 px-1 rounded cursor-default select-none group
        ${isSelected ? "bg-white/10" : "hover:bg-white/5"}`}
      onClick={onRowClick}
    >
      <button
        className={`shrink-0 text-xs w-3.5 text-center transition-colors
          ${isStarred
            ? "text-yellow-500/70 hover:text-yellow-400"
            : "text-transparent group-hover:text-gray-600 hover:!text-gray-400"
          }`}
        onClick={(e) => { e.stopPropagation(); isStarred ? unstar(node.id) : star(node.id); }}
        title={isStarred ? "Unstar" : "Star"}
      >
        {isStarred ? "★" : "☆"}
      </button>
      <span className="text-gray-600 text-xs w-3 shrink-0 text-center">
        {node.isLeaf ? "·" : node.isOpen ? "▾" : "▸"}
      </span>
      <span className={`font-mono text-sm truncate ${node.isLeaf ? "text-gray-400" : "text-gray-200"}`}>
        {node.data.name}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function FileListPanel() {
  const files = useFilesStore(s => s.files);
  const containerRef = useRef<HTMLDivElement>(null);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setHeight(entries[0].contentRect.height));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (files.length === 0) {
    return <p className="p-4 text-gray-500 text-sm">Loading…</p>;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <StarredSection />
      <div className="border-b border-white/10 shrink-0">
        <button
          className="w-full flex items-center gap-1 px-2 py-1 text-xs text-gray-400 uppercase tracking-wider hover:text-gray-200 font-mono"
          onClick={() => setTreeCollapsed(c => !c)}
        >
          <span className="text-gray-600 w-3 text-center">{treeCollapsed ? "▸" : "▾"}</span>
          Files
        </button>
      </div>
      <div ref={containerRef} className={treeCollapsed ? "h-0" : "flex-1 min-h-0 overflow-hidden"}>
        {!treeCollapsed && (
          <Tree
            data={buildTree(files)}
            openByDefault={false}
            width="100%"
            height={height}
            indent={16}
            rowHeight={26}
          >
            {FileNode}
          </Tree>
        )}
      </div>
    </div>
  );
}
