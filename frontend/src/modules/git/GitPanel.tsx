import { useShallow } from "zustand/react/shallow";
import { useRelay } from "../../core/RelayProvider";
import { useOnConnect } from "../../core/useOnConnect";
import { Panel, SidebarLayout, CollapsibleSection, EmptyState } from "../../panels/Panel";
import { useGitStore, type Worktree } from "./store";

// ---------------------------------------------------------------------------
// Diff view — colored line-by-line rendering
// ---------------------------------------------------------------------------

function DiffView() {
  const diff = useGitStore(s => s.diff);

  if (diff === null) return <EmptyState message="Loading…" />;
  if (!diff.trim()) return <EmptyState message="No changes" />;

  return (
    <Panel>
      <div className="flex-1 overflow-auto">
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
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Sidebar: Diffs + Worktrees
// ---------------------------------------------------------------------------

function GitSidebar({ repo }: { repo: string }) {
  const { request } = useRelay();
  const setDiff = useGitStore(s => s.setDiff);
  const worktrees = useGitStore(s => s.worktrees);

  return (
    <Panel>
      <CollapsibleSection title="Diffs">
        <div
          className="px-3 py-1.5 cursor-default select-none hover:bg-alf-surface font-mono text-xs text-gray-300"
          onClick={() => {
            setDiff(null);
            request<{ diff: string }>({ type: "git/diff", repo })
              .then(res => setDiff(res.diff))
              .catch(console.error);
          }}
        >
          Unstaged changes
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Worktrees">
        {worktrees.length === 0
          ? <p className="px-3 py-2 text-gray-600 text-xs font-mono">No worktrees</p>
          : <div className="divide-y divide-white/5">
              {worktrees.map((wt: Worktree) => (
                <div key={wt.path} className="px-3 py-2">
                  <div className="font-mono text-xs text-gray-300 truncate">{wt.branch || "(detached)"}</div>
                  <div className="font-mono text-xs text-gray-600 truncate">{wt.path}</div>
                </div>
              ))}
            </div>
        }
      </CollapsibleSection>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function GitPanel({ repo }: { repo: string }) {
  const { request } = useRelay();
  const { setWorktrees, setDiff } = useGitStore(useShallow(s => ({ setWorktrees: s.setWorktrees, setDiff: s.setDiff })));

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
    <SidebarLayout
      sidebar={<GitSidebar repo={repo} />}
      main={<DiffView />}
    />
  );
}
