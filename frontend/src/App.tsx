import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { useState } from "react";
import { RelayProvider } from "./core/RelayProvider";
import { OverviewPage } from "./pages/OverviewPage";
import { RepoPage } from "./pages/RepoPage";
import { TokenGate } from "./core/TokenGate";

// Dev: VITE_RELAY_URL points to a different port (e.g. ws://localhost:5001/client)
// Prod: same origin, just derive wss://{host}/client from the page URL
const relayUrl = import.meta.env.VITE_RELAY_URL
  ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/client`;

// Wrapper forces full re-mount of RepoPage on repo change via key,
// so useOnConnect in RepoPage registers fresh without needing useEffect deps.
function RepoRoute() {
  const { repo } = useParams<{ repo: string }>();
  return <RepoPage key={repo} repo={repo!} />;
}

function getInitialToken(): string | null {
  return import.meta.env.VITE_RELAY_TOKEN
    ?? localStorage.getItem("relay_token");
}

export function App() {
  const [token, setToken] = useState<string | null>(getInitialToken);

  if (!token) {
    return (
      <TokenGate onToken={(t) => {
        localStorage.setItem("relay_token", t);
        setToken(t);
      }} />
    );
  }

  return (
    <RelayProvider url={relayUrl} token={token}>
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
