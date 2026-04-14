import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { RelayProvider } from "./lib/RelayProvider";
import { OverviewPage } from "./pages/OverviewPage";
import { RepoPage } from "./pages/RepoPage";

const relayUrl = import.meta.env.VITE_RELAY_URL ?? "ws://localhost:3100/client";
const relayToken = import.meta.env.VITE_RELAY_TOKEN ?? "dev-token";

export function App() {
  return (
    <RelayProvider url={relayUrl} token={relayToken}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/:repo" element={<RepoPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </RelayProvider>
  );
}
