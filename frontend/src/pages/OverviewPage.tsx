import { Link } from "react-router-dom";
import { useRelay } from "../core/RelayProvider";
import { useOnConnect } from "../core/useOnConnect";
import { useGlobalStore } from "../core/globalStore";

export function OverviewPage() {
  const { request } = useRelay();
  const { repos, setRepos } = useGlobalStore();

  useOnConnect(() => {
    request<{ repos: string[] }>({ type: "repos/list" })
      .then(res => setRepos(res.repos))
      .catch(console.error);
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Repos</h1>
      {repos.length === 0 ? (
        <p className="text-gray-500">No repos found.</p>
      ) : (
        <ul className="space-y-1">
          {repos.map(repo => (
            <li key={repo}>
              <Link
                to={`/${repo}`}
                className="font-mono text-blue-400 hover:text-blue-300 hover:underline"
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
