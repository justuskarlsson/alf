import { useEffect, useRef, useState } from "react";
import { Tree, type NodeRendererProps } from "react-arborist";
import { useShallow } from "zustand/react/shallow";
import type { FilesGetResponse } from "@alf/types";
import { useRelay } from "../../core/RelayProvider";
import { usePanelInit } from "../../core/usePanelInit";
import { useRepo } from "../../core/useRepo";
import { Panel, SidebarLayout, CollapsibleSection, EmptyState } from "../../panels/Panel";
import { FileContentPanel } from "./FileContentPanel";
import { useFilesStore, type FileEntry } from "./store";

// ---------------------------------------------------------------------------
// Top-level export — entry point for this module.
// ---------------------------------------------------------------------------

export function FilesPanel({ repo }: { repo: string }) {
  const { listFiles, loadStarred } = useFilesStore(useShallow(s => ({
    listFiles: s.listFiles,
    loadStarred: s.loadStarred,
  })));
  const selectedFile = useFilesStore(s => s.selectedFile);
  const hasContent = useFilesStore(s => s.fileContent !== null);
  const contentKey = selectedFile ? (hasContent ? selectedFile : `${selectedFile}:loading`) : "empty";

  usePanelInit((request) => {
    loadStarred(repo);
    listFiles(repo, request);
  });

  return (
    <SidebarLayout
      defaultSize={40}
      minSize={20}
      sidebar={<FilesSidebar />}
      main={<FileContentPanel key={contentKey} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Panels and sections
// ---------------------------------------------------------------------------

function FilesSidebar() {
  const files = useFilesStore(s => s.files);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setHeight(entries[0].contentRect.height));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (files.length === 0) return <EmptyState message="Loading…" />;

  return (
    <Panel>
      <StarredSection />
      <CollapsibleSection title="Files" fill>
        <div ref={containerRef} className="h-full">
          <Tree
            data={buildTree(files)}
            openByDefault={false}
            width="100%"
            height={height}
            indent={14}
            rowHeight={24}
          >
            {FileNode}
          </Tree>
        </div>
      </CollapsibleSection>
    </Panel>
  );
}

function StarredSection() {
  const files = useFilesStore(s => s.files);
  const starred = useFilesStore(s => s.starred);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(200);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setHeight(entries[0].contentRect.height));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Build filtered list: starred files + starred directories with all children
  const starredSet = new Set(starred);
  const included = files.filter(f => {
    if (starredSet.has(f.path)) return true;
    // Include children of starred directories
    for (const s of starred) {
      if (f.path.startsWith(s + "/")) return true;
    }
    return false;
  });

  if (included.length === 0) return null;

  const treeData = buildTree(included);

  return (
    <CollapsibleSection title="Starred">
      <div ref={containerRef} className="min-h-[60px] max-h-[40vh]">
        <Tree
          data={treeData}
          openByDefault={true}
          width="100%"
          height={height}
          indent={14}
          rowHeight={24}
        >
          {FileNode}
        </Tree>
      </div>
    </CollapsibleSection>
  );
}

function FileNode({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const openFile = useOpenFile();
  const repo = useRepo();
  const { starred, star, unstar, selectedFile } = useFilesStore(useShallow(s => ({
    starred: s.starred,
    star: s.star,
    unstar: s.unstar,
    selectedFile: s.selectedFile,
  })));
  const isStarred = starred.includes(node.id);
  const isSelected = selectedFile === node.id;

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`flex items-center gap-1 px-1 rounded cursor-pointer select-none group
        ${isSelected ? "bg-alf-surface" : "hover:bg-alf-surface/60"}`}
      onClick={() => node.isInternal ? node.toggle() : openFile(node.id)}
    >
      <button
        className={`shrink-0 text-xs w-3.5 text-center transition-colors
          ${isStarred
            ? "text-yellow-500/70 hover:text-yellow-400"
            : "text-transparent group-hover:text-slate-600 hover:!text-slate-400"}`}
        onClick={(e) => {
          e.stopPropagation();
          if (repo) isStarred ? unstar(repo, node.id) : star(repo, node.id);
        }}
        title={isStarred ? "Unstar" : "Star"}
      >
        {isStarred ? "★" : "☆"}
      </button>
      <span className="text-slate-600 text-xs w-3 shrink-0 text-center">
        {node.isLeaf ? "" : node.isOpen ? "▾" : "▸"}
      </span>
      <span className={`font-mono text-sm truncate ${node.isLeaf ? "text-slate-400" : "text-slate-200"}`}>
        {node.data.name}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useOpenFile() {
  const { request } = useRelay();
  const repo = useRepo();
  const { setSelectedFile, setFileContent } = useFilesStore(useShallow(s => ({
    setSelectedFile: s.setSelectedFile,
    setFileContent: s.setFileContent,
  })));

  return (filePath: string) => {
    if (!repo) return;
    setSelectedFile(filePath);
    setFileContent(null);
    request<FilesGetResponse>({ type: "files/get", repo, path: filePath })
      .then(res => setFileContent(res.content))
      .catch(console.error);
  };
}

// ---------------------------------------------------------------------------
// Helpers
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
