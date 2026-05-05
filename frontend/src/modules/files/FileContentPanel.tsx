import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { codeToHtml } from "shiki";
import { Panel, EmptyState, CollapsibleSection } from "../../panels/Panel";
import { useFilesStore } from "./store";
import { detectLang } from "../../shared/lang";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp"]);
const MIME_MAP: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
};

function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

function imageMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "image/png";
}

// Parent (FilesPanel) uses key={contentKey} to force re-mount when file + content
// are both ready, so useEffect([]) fires once with correct content available.
export function FileContentPanel() {
  const { fileContent, selectedFile, isBinary } = useFilesStore(useShallow(s => ({
    fileContent: s.fileContent,
    selectedFile: s.selectedFile,
    isBinary: s.isBinary,
  })));
  const [html, setHtml] = useState<string>("");

  const isImage = selectedFile ? isImageFile(selectedFile) : false;

  useEffect(() => {
    if (!fileContent || !selectedFile || isImage) return;
    codeToHtml(fileContent, {
      lang: detectLang(selectedFile),
      theme: "github-dark",
    }).then(setHtml);
  }, []);

  if (!selectedFile) return <EmptyState message="Select a file" />;
  if (fileContent === null) return <EmptyState message="Loading…" />;

  // Image rendering
  if (isImage && fileContent) {
    const src = isBinary
      ? `data:${imageMime(selectedFile)};base64,${fileContent}`
      : selectedFile.endsWith(".svg")
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fileContent)}`
        : fileContent;
    return (
      <Panel>
        <div className="px-3 py-1.5 text-xs text-slate-500 font-mono border-b border-alf-border shrink-0 bg-alf-canvas">
          {selectedFile}
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-4" data-testid="image-preview">
          <img src={src} alt={selectedFile} className="max-w-full max-h-full object-contain" />
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="px-3 py-1.5 text-xs text-slate-500 font-mono border-b border-alf-border shrink-0 bg-alf-canvas">
        {selectedFile}
      </div>
      <OutlineSection />
      <div className="flex-1 overflow-auto" data-alf-ctx-file={selectedFile}>
        {html
          ? <div className="alf-shiki" dangerouslySetInnerHTML={{ __html: html }} />
          : <pre className="p-4 font-mono text-sm text-slate-300 whitespace-pre-wrap">{fileContent}</pre>
        }
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Outline section — collapsible symbol list with click-to-scroll
// ---------------------------------------------------------------------------

function OutlineSection() {
  const { outlineSymbols, outlineLoading } = useFilesStore(useShallow(s => ({
    outlineSymbols: s.outlineSymbols,
    outlineLoading: s.outlineLoading,
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

  if (sortBySize && filtered.some(s => s.endLine)) {
    filtered = [...filtered].sort((a, b) => ((b.endLine ?? b.line) - b.line) - ((a.endLine ?? a.line) - a.line));
  }

  if (outlineLoading) return null;
  if (outlineSymbols.length === 0) return null;

  const kindIcon = (kind: string) => {
    switch (kind) {
      case "function": return "fn";
      case "class": return "C";
      case "method": return "m";
      case "variable": return "v";
      default: return "?";
    }
  };
  const kindColor = (kind: string) => {
    switch (kind) {
      case "function": return "text-sky-400";
      case "class": return "text-amber-400";
      case "method": return "text-purple-400";
      case "variable": return "text-green-400";
      default: return "text-slate-400";
    }
  };

  return (
    <CollapsibleSection title="Outline" defaultOpen={false}>
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
    </CollapsibleSection>
  );
}

function scrollToLine(line: number) {
  const container = document.querySelector(".alf-shiki");
  if (!container) return;
  const lines = container.querySelectorAll(":scope > pre > code > .line, :scope > pre > code > span");
  const target = lines[line - 1]; // 1-based to 0-based
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
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
