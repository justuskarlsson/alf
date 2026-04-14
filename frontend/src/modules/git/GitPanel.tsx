import { useRelay } from "../../core/RelayProvider";
import { useOnConnect } from "../../core/useOnConnect";
import { PanelGrid } from "../../panels/PanelGrid";
import { useGitStore, type Worktree } from "./store";

// ---------------------------------------------------------------------------
// Diff view — colored line-by-line rendering
// ---------------------------------------------------------------------------

function DiffView() {
  const diff = useGitStore(s => s.diff);

  if (diff === null) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-sm">
        Loading…
      </div>
    );
  }

  if (!diff.trim()) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        No changes
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <pre className="font-mono text-xs leading-5 p-4">
        {diff.split("\n").map((line, i) => (
          <div
            key={i}
            className={
              line.startsWith("+") && !line.startsWith("+++") ? "text-green-400" :
              line.startsWith("-") && !line.startsWith("---") ? "text-red-400/80" :
              line.startsWith("@@") ? "text-blue-400/80" :
              line.startsWith("diff ") || line.startsWith("index ") ? "text-gray-500" :
              "text-gray-300"
            }
          >
            {line || "\u00a0"}
          </div>
        ))}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Worktrees list
// ---------------------------------------------------------------------------

function WorktreeList() {
  const worktrees = useGitStore(s => s.worktrees);

  if (worktrees.length === 0) {
    return <p className="p-3 text-gray-600 text-xs font-mono">No worktrees</p>;
  }

  return (
    <div className="divide-y divide-white/5">
      {worktrees.map((wt: Worktree) => (
        <div key={wt.path} className="px-3 py-2">
          <div className="font-mono text-xs text-gray-300 truncate">{wt.branch || "(detached)"}</div>
          <div className="font-mono text-xs text-gray-600 truncate">{wt.path}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar: Diffs + Worktrees
// ---------------------------------------------------------------------------

function GitSidebar({ repo }: { repo: string }) {
  const { request } = useRelay();
  const setDiff = useGitStore(s => s.setDiff);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b border-white/10 shrink-0">
        <div className="px-2 py-1 text-xs text-gray-400 uppercase tracking-wider font-mono">Diffs</div>
        <div
          className="px-3 py-1.5 cursor-default select-none hover:bg-white/5 font-mono text-xs text-gray-300"
          onClick={() => {
            setDiff(null);
            request<{ diff: string }>({ type: "git/diff", repo })
              .then(res => setDiff(res.diff))
              .catch(console.error);
          }}
        >
          Unstaged changes
        </div>
      </div>
      <div className="border-b border-white/10 shrink-0">
        <div className="px-2 py-1 text-xs text-gray-400 uppercase tracking-wider font-mono">Worktrees</div>
        <WorktreeList />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function GitPanel({ repo }: { repo: string }) {
  const { request } = useRelay();
  const { setWorktrees, setDiff } = useGitStore(s => ({ setWorktrees: s.setWorktrees, setDiff: s.setDiff }));

  useOnConnect(() => {
    setDiff(null);
    request<{ diff: string }>({ type: "git/diff", repo })
      .then(res => setDiff(res.diff))
      .catch(console.error);
    request<{ worktrees: Worktree[] }>({ type: "git/worktrees", repo })
      .then(res => setWorktrees(res.worktrees))
      .catch(console.error);
  });

  return (
    <PanelGrid panels={[
      { id: "git-sidebar", content: <GitSidebar repo={repo} />, defaultSize: 25, minSize: 15 },
      { id: "git-diff", content: <DiffView /> },
    ]} />
  );
}
