import { useEffect, useState } from "react";
import { parseDiff, Diff, Hunk, type HunkData, type HunkTokens } from "react-diff-view";
import "react-diff-view/style/index.css";
import { useShallow } from "zustand/react/shallow";
import { useRelay } from "../../core/RelayProvider";
import { usePanelInit } from "../../core/usePanelInit";
import { Panel, SidebarLayout, CollapsibleSection, EmptyState } from "../../panels/Panel";
import { useGitStore, type Worktree, type GitCommit } from "./store";
import { detectLang } from "../../shared/lang";
import { tokenizeDiffHunks, shikiRenderToken } from "./tokenize.js";

// ---------------------------------------------------------------------------
// Top-level export
// ---------------------------------------------------------------------------

export function GitPanel({ repo }: { repo: string }) {
  const { setWorktrees, loadChangedFiles, loadDiff, setSelectedWorktree, loadCommits } =
    useGitStore(useShallow(s => ({
      setWorktrees: s.setWorktrees,
      loadChangedFiles: s.loadChangedFiles,
      loadDiff: s.loadDiff,
      setSelectedWorktree: s.setSelectedWorktree,
      loadCommits: s.loadCommits,
    })));
  const selectedWorktree = useGitStore(s => s.selectedWorktree);
  const activeRepo = selectedWorktree?.path.split("/").pop() ?? repo;

  usePanelInit((request) => {
    setSelectedWorktree(null);
    loadChangedFiles(repo, request);
    loadDiff(repo, null, request);
    loadCommits(repo, request);
    request<{ worktrees: Worktree[] }>({ type: "git/worktrees", repo })
      .then(res => setWorktrees(res.worktrees))
      .catch(console.error);
  });

  return (
    <SidebarLayout
      sidebar={<GitSidebar activeRepo={activeRepo} />}
      main={<DiffView />}
    />
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function DiffView() {
  const diff = useGitStore(s => s.diff);
  const diffBase = useGitStore(s => s.diffBase);

  if (diff === null) return <EmptyState message="Loading…" />;
  if (!diff.trim()) return <EmptyState message="No changes" />;

  let files: ReturnType<typeof parseDiff> = [];
  try { files = parseDiff(diff); } catch { /* malformed diff */ }
  if (files.length === 0) return <EmptyState message="No changes" />;

  const commitAttr = diffBase !== "unstaged" ? diffBase : undefined;

  return (
    <Panel>
      <div className="flex-1 overflow-auto alf-diff bg-alf-bg" {...(commitAttr ? { "data-alf-ctx-commit": commitAttr } : {})}>
        {files.map(({ oldRevision, newRevision, type, hunks, oldPath, newPath }) => {
          // Deleted files have newPath="/dev/null" — show oldPath instead
          const displayPath = (newPath && newPath !== "/dev/null") ? newPath : (oldPath ?? "");
          return (
            <HighlightedFile
              key={`${oldRevision}-${newRevision}`}
              type={type}
              hunks={hunks}
              newPath={displayPath}
            />
          );
        })}
      </div>
    </Panel>
  );
}

function HighlightedFile({ type, hunks, newPath }: {
  type: ReturnType<typeof parseDiff>[0]["type"];
  hunks: HunkData[];
  newPath: string;
}) {
  const [tokens, setTokens] = useState<HunkTokens | null>(null);

  useEffect(() => {
    const lang = detectLang(newPath);
    tokenizeDiffHunks(hunks, lang).then(setTokens);
  }, [hunks, newPath]);

  return (
    <div className="mb-4" data-alf-ctx-file={newPath}>
      <div className="px-3 py-1 text-xs font-mono text-slate-400 bg-alf-canvas border-b border-t border-alf-border sticky top-0 z-10">
        {newPath}
      </div>
      <Diff viewType="unified" diffType={type} hunks={hunks} tokens={tokens} renderToken={shikiRenderToken}>
        {hunks => hunks.map(hunk => <Hunk key={hunk.content} hunk={hunk} />)}
      </Diff>
    </div>
  );
}

function GitSidebar({ activeRepo }: { activeRepo: string }) {
  const { request } = useRelay();
  const { loadDiff, loadChangedFiles, setSelectedWorktree, selectDiffBase, loadCommitDiff } =
    useGitStore(useShallow(s => ({
      loadDiff: s.loadDiff,
      loadChangedFiles: s.loadChangedFiles,
      setSelectedWorktree: s.setSelectedWorktree,
      selectDiffBase: s.selectDiffBase,
      loadCommitDiff: s.loadCommitDiff,
    })));
  const worktrees        = useGitStore(s => s.worktrees);
  const changedFiles     = useGitStore(s => s.changedFiles);
  const selectedDiffFile = useGitStore(s => s.selectedDiffFile);
  const selectedWorktree = useGitStore(s => s.selectedWorktree);
  const commits          = useGitStore(s => s.commits);
  const diffBase         = useGitStore(s => s.diffBase);
  const commitDiffFiles  = useGitStore(s => s.commitDiffFiles);

  // Files to show in the Diffs section — depends on diffBase
  const diffFiles = diffBase === "unstaged" ? changedFiles : commitDiffFiles;

  function handleFileClick(file: string | null) {
    if (diffBase === "unstaged") {
      loadDiff(activeRepo, file, request);
    } else {
      loadCommitDiff(diffBase, file, activeRepo, request);
    }
  }

  return (
    <Panel>
      <div className="flex-1 overflow-auto">
      <CollapsibleSection title="Diffs">
        <div className="max-h-[40vh] overflow-auto">
          <div
            data-testid="git-all-changes"
            className={`px-3 py-1.5 cursor-pointer select-none font-mono text-xs transition-colors
              ${diffBase === "unstaged" && selectedDiffFile === null
                ? "bg-alf-surface text-slate-300"
                : "text-slate-500 hover:bg-alf-surface/60 hover:text-slate-400"}`}
            onClick={() => handleFileClick(null)}
          >
            All changes
          </div>
          {diffFiles.map(file => {
            const basename = file.split("/").pop() ?? file;
            const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : null;
            return (
              <div
                key={file}
                className={`px-3 py-1 cursor-pointer select-none font-mono text-xs transition-colors
                  ${selectedDiffFile === file
                    ? "bg-alf-surface text-slate-300"
                    : "text-slate-500 hover:bg-alf-surface/60 hover:text-slate-400"}`}
                onClick={() => handleFileClick(file)}
                title={file}
              >
                <span>{basename}</span>
                {dir && <span className="ml-1 text-slate-700">{dir}</span>}
              </div>
            );
          })}
          {diffFiles.length === 0 && (
            <p className="px-3 py-1 text-slate-700 text-xs font-mono">No changes</p>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Commits">
        <div className="max-h-[40vh] overflow-auto">
          {/* Unstaged row — always at top */}
          <div
            className={`px-3 py-1.5 cursor-pointer select-none font-mono text-xs transition-colors
              ${diffBase === "unstaged"
                ? "bg-alf-surface text-slate-300"
                : "text-slate-500 hover:bg-alf-surface/60 hover:text-slate-400"}`}
            onClick={() => selectDiffBase("unstaged", activeRepo, request)}
          >
            Unstaged
          </div>
          {commits.map((c: GitCommit) => {
            const isActive = diffBase === c.sha;
            const shortSubject = c.subject.length > 50 ? c.subject.slice(0, 50) + "…" : c.subject;
            const date = new Date(c.date).toLocaleDateString();
            return (
              <div
                key={c.sha}
                className={`px-3 py-1.5 cursor-pointer select-none transition-colors
                  ${isActive ? "bg-alf-surface" : "hover:bg-alf-surface/60"}`}
                onClick={() => selectDiffBase(c.sha, activeRepo, request)}
                title={c.subject}
              >
                <div className="font-mono text-xs text-slate-300 truncate">{shortSubject}</div>
                <div className="font-mono text-xs text-slate-600">{date}</div>
              </div>
            );
          })}
          {commits.length === 0 && (
            <p className="px-3 py-1 text-slate-700 text-xs font-mono">No commits</p>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Worktrees">
        {worktrees.length === 0
          ? <p className="px-3 py-2 text-slate-600 text-xs font-mono">No worktrees</p>
          : <div className="divide-y divide-alf-muted">
              {worktrees.map((wt: Worktree) => {
                const name = wt.path.split("/").pop() ?? wt.path;
                const isActive = selectedWorktree?.path === wt.path;
                return (
                  <div
                    key={wt.path}
                    className={`px-3 py-2 cursor-pointer transition-colors
                      ${isActive ? "bg-alf-surface" : "hover:bg-alf-surface/60"}`}
                    onClick={() => {
                      setSelectedWorktree(wt);
                      loadChangedFiles(name, request);
                      loadDiff(name, null, request);
                    }}
                  >
                    <div className="font-mono text-xs text-slate-300 truncate">{wt.branch || "(detached)"}</div>
                    <div className="font-mono text-xs text-slate-600 truncate">{name}</div>
                  </div>
                );
              })}
            </div>
        }
      </CollapsibleSection>
      </div>
    </Panel>
  );
}
