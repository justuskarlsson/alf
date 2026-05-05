import { useEffect, useRef, useState } from "react";
import { Tree, type NodeRendererProps } from "react-arborist";
import { useShallow } from "zustand/react/shallow";
import type { FilesGetResponse } from "@alf/types";
import { useRelay } from "../../core/RelayProvider";
import { usePanelInit } from "../../core/usePanelInit";
import { useRepo } from "../../core/useRepo";
import { Panel, PanelHeader, SidebarLayout, CollapsibleSection, EmptyState } from "../../panels/Panel";
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
  const isBinary = useFilesStore(s => s.isBinary);
  const hasContent = useFilesStore(s => s.fileContent !== null);
  const contentKey = selectedFile ? (hasContent ? `${selectedFile}:${isBinary}` : `${selectedFile}:loading`) : "empty";

  usePanelInit((request) => {
    loadStarred(repo);
    listFiles(repo, request);
  });

  return (
    <SidebarLayout
      defaultSize={40}
      minSize={20}
      sidebar={<FilesSidebar repo={repo} />}
      main={<FileContentPanel key={contentKey} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Panels and sections
// ---------------------------------------------------------------------------

function FilesSidebar({ repo }: { repo: string }) {
  const { request } = useRelay();
  const files = useFilesStore(s => s.files);
  const filesLoading = useFilesStore(s => s.filesLoading);
  const { showHidden, setShowHidden } = useFilesStore(useShallow(s => ({
    showHidden: s.showHidden,
    setShowHidden: s.setShowHidden,
  })));
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => setHeight(entries[0].contentRect.height));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (files.length === 0 && filesLoading) return <EmptyState message="Loading…" />;

  return (
    <Panel>
      <PanelHeader title="">
        <button
          onClick={() => setShowHidden(!showHidden, repo, request)}
          title={showHidden ? "Hide gitignored files" : "Show gitignored files"}
          data-testid="show-hidden-toggle"
          className={`font-mono text-xs transition-colors
            ${showHidden ? "text-slate-300" : "text-slate-600 hover:text-slate-400"}`}
        >{showHidden ? "⦿ hidden" : "○ hidden"}</button>
      </PanelHeader>
      <StarredSection />
      <OutlineSection />
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
      <div ref={containerRef} className="overflow-auto max-h-64">
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
  const { setSelectedFile, setFileContent, setIsBinary, loadOutline } = useFilesStore(useShallow(s => ({
    setSelectedFile: s.setSelectedFile,
    setFileContent: s.setFileContent,
    setIsBinary: s.setIsBinary,
    loadOutline: s.loadOutline,
  })));

  return (filePath: string) => {
    if (!repo) return;
    setSelectedFile(filePath);
    setFileContent(null);
    setIsBinary(false);
    request<FilesGetResponse>({ type: "files/get", repo, path: filePath })
      .then(res => {
        setFileContent(res.content);
        setIsBinary(res.isBinary === true);
      })
      .catch(console.error);
    loadOutline(repo, filePath, request);
  };
}

// ---------------------------------------------------------------------------
// Outline section — collapsible symbol list with click-to-scroll
// ---------------------------------------------------------------------------

function OutlineSection() {
  const { outlineSymbols, outlineLoading, selectedFile } = useFilesStore(useShallow(s => ({
    outlineSymbols: s.outlineSymbols,
    outlineLoading: s.outlineLoading,
    selectedFile: s.selectedFile,
  })));

  const [showFunctions, setShowFunctions] = useState(true);
  const [showClasses, setShowClasses] = useState(true);
  const [showMethods, setShowMethods] = useState(true);
  const [showVariables, setShowVariables] = useState(false);
  const [exportsOnly, setExportsOnly] = useState(false);
  const [sortBySize, setSortBySize] = useState(false);

  // Filter and sort
  let filtered = outlineSymbols.filter(s => {
    if (!showFunctions && s.kind === "function") return false;
    if (!showClasses && s.kind === "class") return false;
    if (!showMethods && s.kind === "method") return false;
    if (!showVariables && s.kind === "variable") return false;
    if (exportsOnly && !s.exported) return false;
    return true;
  });

  if (sortBySize) {
    filtered = [...filtered].sort((a, b) => ((b.endLine ?? b.line) - b.line) - ((a.endLine ?? a.line) - a.line));
  }

  const empty = !selectedFile
    ? "Select a file"
    : outlineLoading
      ? "Loading…"
      : outlineSymbols.length === 0
        ? "No symbols"
        : null;

  return (
    <CollapsibleSection title="Outline" defaultOpen={false}>
      {empty ? (
        <div className="px-2 py-2 text-xs text-slate-600 font-mono">{empty}</div>
      ) : (
        <>
          <div className="px-2 py-1 flex gap-1 flex-wrap text-[10px] font-mono">
            <FilterBtn label="fn" active={showFunctions} onClick={() => setShowFunctions(v => !v)} />
            <FilterBtn label="class" active={showClasses} onClick={() => setShowClasses(v => !v)} />
            <FilterBtn label="method" active={showMethods} onClick={() => setShowMethods(v => !v)} />
            <FilterBtn label="var" active={showVariables} onClick={() => setShowVariables(v => !v)} />
            <FilterBtn label="exports" active={exportsOnly} onClick={() => setExportsOnly(v => !v)} />
            <span className="mx-1 text-slate-700">|</span>
            <FilterBtn label={sortBySize ? "size" : "line"} active={sortBySize} onClick={() => setSortBySize(v => !v)} />
          </div>
          <div className="overflow-auto max-h-48">
            {filtered.map((sym, i) => (
              <button
                key={`${sym.name}-${sym.line}-${i}`}
                onClick={() => scrollToLine(sym.line)}
                className="w-full text-left px-2 py-0.5 flex items-center gap-1.5 hover:bg-alf-surface transition-colors text-xs font-mono"
              >
                <span className={`w-4 text-center ${kindColor(sym.kind)}`}>{kindIcon(sym.kind)}</span>
                <span className="text-slate-300 truncate flex-1">
                  {sym.parent ? <span className="text-slate-600">{sym.parent}.</span> : null}
                  {sym.name}
                </span>
                <span className="text-slate-600 tabular-nums">{sym.line}</span>
                {sym.endLine && <span className="text-slate-700 tabular-nums text-[9px]">({sym.endLine - sym.line}L)</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}

function scrollToLine(line: number) {
  const container = document.querySelector(".alf-shiki");
  if (!container) return;
  const lines = container.querySelectorAll(":scope > pre > code > .line, :scope > pre > code > span");
  const target = lines[line - 1]; // 1-based to 0-based
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  // Add highlight
  (target as HTMLElement).classList.add("alf-line-highlight");
  setTimeout(() => (target as HTMLElement).classList.remove("alf-line-highlight"), 1500);
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-1.5 py-0.5 rounded transition-colors
        ${active ? "bg-alf-surface text-slate-300" : "text-slate-600 hover:text-slate-400"}`}
    >{label}</button>
  );
}

function kindIcon(kind: string) {
  switch (kind) {
    case "function": return "fn";
    case "class": return "C";
    case "method": return "m";
    case "variable": return "v";
    default: return "?";
  }
}

function kindColor(kind: string) {
  switch (kind) {
    case "function": return "text-sky-400";
    case "class": return "text-amber-400";
    case "method": return "text-purple-400";
    case "variable": return "text-green-400";
    default: return "text-slate-400";
  }
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
