import { useEffect, useRef, useState } from "react";
import { Tree, type NodeRendererProps } from "react-arborist";
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

  // Backend sends files sorted lexicographically: parent dirs before children
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
// Node renderer
// ---------------------------------------------------------------------------

function FileNode({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  return (
    <div
      ref={dragHandle}
      style={style}
      className={`flex items-center gap-1.5 px-1 rounded cursor-default select-none
        ${node.isSelected ? "bg-white/10" : "hover:bg-white/5"}`}
      onClick={() => node.isInternal && node.toggle()}
    >
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
  const [height, setHeight] = useState(500);

  // Measure container height for react-arborist virtualisation
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
    <div ref={containerRef} className="h-full overflow-hidden">
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
    </div>
  );
}
