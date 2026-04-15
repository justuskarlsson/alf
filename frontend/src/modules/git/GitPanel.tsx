import { useNavigate } from "react-router-dom";
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
        <pre className="font-mono text-xs leading-5 p-4">
          {diff.split("\n").map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("+") && !line.startsWith("+++") ? "text-emerald-400/90" :
                line.startsWith("-") && !line.startsWith("---") ? "text-red-400/80" :
                line.startsWith("@@") ? "text-sky-400/80" :
                line.startsWith("diff ") || line.startsWith("index ") ? "text-slate-600" :
                "text-slate-400"
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

function GitSidebar({ repo }: { repo: string }) {
  const { request } = useRelay();
  const navigate = useNavigate();
  const setDiff = useGitStore(s => s.setDiff);
  const worktrees = useGitStore(s => s.worktrees);

  return (
    <Panel>
      <CollapsibleSection title="Diffs">
        <div
          className="px-3 py-1.5 cursor-pointer select-none hover:bg-alf-surface/60 font-mono text-xs text-slate-400 transition-colors"
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
          ? <p className="px-3 py-2 text-slate-600 text-xs font-mono">No worktrees</p>
          : <div className="divide-y divide-alf-muted">
              {worktrees.map((wt: Worktree) => {
                const name = wt.path.split("/").pop() ?? wt.path;
                return (
                  <div
                    key={wt.path}
                    className="px-3 py-2 hover:bg-alf-surface/60 cursor-pointer transition-colors"
                    onClick={() => navigate(`/${name}`)}
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
