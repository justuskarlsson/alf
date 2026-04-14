import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useRelay } from "../lib/RelayProvider";
import { useRepoStore } from "../store/repoStore";

export function OverviewPage() {
  const { request, isConnected } = useRelay();
  const { repos, setRepos } = useRepoStore();

  useEffect(() => {
    if (!isConnected) return;
    request<{ repos: string[] }>({ type: "repos/list" })
      .then((res) => setRepos(res.repos))
      .catch(console.error);
  }, [isConnected]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Repos</h1>
      {repos.length === 0 ? (
        <p className="text-gray-400">{isConnected ? "No repos found." : "Connecting…"}</p>
      ) : (
        <ul className="space-y-1">
          {repos.map((repo) => (
            <li key={repo}>
              <Link
                to={`/${repo}`}
                className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
              >
                {repo}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
