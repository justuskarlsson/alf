import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { codeToHtml } from "shiki";
import { Panel, EmptyState } from "../../panels/Panel";
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
      <div className="flex-1 overflow-auto">
        {html
          ? <div className="alf-shiki" dangerouslySetInnerHTML={{ __html: html }} />
          : <pre className="p-4 font-mono text-sm text-slate-300 whitespace-pre-wrap">{fileContent}</pre>
        }
      </div>
    </Panel>
  );
}
