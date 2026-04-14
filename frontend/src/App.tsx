import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { RelayProvider } from "./core/RelayProvider";
import { OverviewPage } from "./pages/OverviewPage";
import { RepoPage } from "./pages/RepoPage";

const relayUrl = import.meta.env.VITE_RELAY_URL ?? "ws://localhost:3100/client";
const relayToken = import.meta.env.VITE_RELAY_TOKEN ?? "dev-token";

// Wrapper forces full re-mount of RepoPage on repo change via key,
// so useOnConnect in RepoPage registers fresh without needing useEffect deps.
function RepoRoute() {
  const { repo } = useParams<{ repo: string }>();
  return <RepoPage key={repo} repo={repo!} />;
}

export function App() {
  return (
    <RelayProvider url={relayUrl} token={relayToken}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/:repo" element={<RepoRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </RelayProvider>
  );
}
