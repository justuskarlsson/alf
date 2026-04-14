import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { codeToHtml } from "shiki";
import { Panel, EmptyState } from "../../panels/Panel";
import { useFilesStore } from "./store";

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  py: "python", rs: "rust", go: "go", sh: "bash", bash: "bash",
  md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
  css: "css", html: "html", sql: "sql", toml: "toml",
  env: "bash", tf: "hcl",
};

function detectLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "text";
}

// Parent (FilesPanel) uses key={contentKey} to force re-mount when file + content
// are both ready, so useEffect([]) fires once with correct content available.
export function FileContentPanel() {
  const { fileContent, selectedFile } = useFilesStore(useShallow(s => ({
    fileContent: s.fileContent,
    selectedFile: s.selectedFile,
  })));
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    if (!fileContent || !selectedFile) return;
    codeToHtml(fileContent, {
      lang: detectLang(selectedFile),
      theme: "github-dark-dimmed",
    }).then(setHtml);
  }, []);

  if (!selectedFile) return <EmptyState message="Select a file" />;
  if (fileContent === null) return <EmptyState message="Loading…" />;

  return (
    <Panel>
      <div className="px-3 py-1 text-xs text-gray-500 font-mono border-b border-alf-border shrink-0">
        {selectedFile}
      </div>
      <div className="flex-1 overflow-auto">
        {html
          ? <div className="alf-shiki text-sm" dangerouslySetInnerHTML={{ __html: html }} />
          : <pre className="p-4 font-mono text-sm text-gray-300 whitespace-pre-wrap">{fileContent}</pre>
        }
      </div>
    </Panel>
  );
}
