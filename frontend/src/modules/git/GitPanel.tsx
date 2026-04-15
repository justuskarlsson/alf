import { useShallow } from "zustand/react/shallow";
import { useRelay } from "../../core/RelayProvider";
import { useOnConnect } from "../../core/useOnConnect";
import { Panel, SidebarLayout, CollapsibleSection, EmptyState } from "../../panels/Panel";
import { useGitStore, type Worktree } from "./store";

function DiffView() {
  const diff = useGitStore(s => s.diff);

  if (diff === null) return <EmptyState message="Loading…" />;
  if (!diff.trim()) return <EmptyState message="No changes" />;

  return (
    <Panel>
      <div className="flex-1 overflow-auto">
        <pre className="font-mono text-xs leading-5">
          {diff.split("\n").map((line, i) => {
            const isAdd  = line.startsWith("+") && !line.startsWith("+++");
            const isDel  = line.startsWith("-") && !line.startsWith("---");
            const isHunk = line.startsWith("@@");
            const isMeta = line.startsWith("diff ") || line.startsWith("index ")
              || line.startsWith("--- ") || line.startsWith("+++ ");
            return (
              <div
                key={i}
                className={`px-4 ${
                  isAdd  ? "bg-emerald-950/60 text-emerald-300" :
                  isDel  ? "bg-red-950/60 text-red-300" :
                  isHunk ? "bg-sky-950/40 text-sky-400/80" :
                  isMeta ? "text-slate-600" :
                           "text-slate-400"
                }`}
              >
                {line || "\u00a0"}
              </div>
            );
          })}
        </pre>
      </div>
    </Panel>
  );
}

function GitSidebar({ activeRepo }: { activeRepo: string }) {
  const { request } = useRelay();
  const { loadDiff, loadChangedFiles, setSelectedWorktree } = useGitStore(useShallow(s => ({
    loadDiff: s.loadDiff,
    loadChangedFiles: s.loadChangedFiles,
    setSelectedWorktree: s.setSelectedWorktree,
  })));
  const worktrees       = useGitStore(s => s.worktrees);
  const changedFiles    = useGitStore(s => s.changedFiles);
  const selectedDiffFile  = useGitStore(s => s.selectedDiffFile);
  const selectedWorktree  = useGitStore(s => s.selectedWorktree);

  return (
    <Panel>
      <CollapsibleSection title="Diffs">
        <div
          className={`px-3 py-1.5 cursor-pointer select-none font-mono text-xs transition-colors
            ${selectedDiffFile === null
              ? "bg-alf-surface text-slate-300"
              : "text-slate-500 hover:bg-alf-surface/60 hover:text-slate-400"}`}
          onClick={() => loadDiff(activeRepo, null, request)}
        >
          All changes
        </div>
        {changedFiles.map(file => {
          const basename = file.split("/").pop() ?? file;
          const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : null;
          return (
            <div
              key={file}
              className={`px-3 py-1 cursor-pointer select-none font-mono text-xs transition-colors
                ${selectedDiffFile === file
                  ? "bg-alf-surface text-slate-300"
                  : "text-slate-500 hover:bg-alf-surface/60 hover:text-slate-400"}`}
              onClick={() => loadDiff(activeRepo, file, request)}
              title={file}
            >
              <span>{basename}</span>
              {dir && <span className="ml-1 text-slate-700">{dir}</span>}
            </div>
          );
        })}
        {changedFiles.length === 0 && (
          <p className="px-3 py-1 text-slate-700 text-xs font-mono">No changes</p>
        )}
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
    </Panel>
  );
}

export function GitPanel({ repo }: { repo: string }) {
  const { request } = useRelay();
  const { setWorktrees, loadChangedFiles, loadDiff, setSelectedWorktree } = useGitStore(useShallow(s => ({
    setWorktrees: s.setWorktrees,
    loadChangedFiles: s.loadChangedFiles,
    loadDiff: s.loadDiff,
    setSelectedWorktree: s.setSelectedWorktree,
  })));
  const selectedWorktree = useGitStore(s => s.selectedWorktree);
  const activeRepo = selectedWorktree?.path.split("/").pop() ?? repo;

  useOnConnect(() => {
    setSelectedWorktree(null);
    loadChangedFiles(repo, request);
    loadDiff(repo, null, request);
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
