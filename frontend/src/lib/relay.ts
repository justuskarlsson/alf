/**
 * Relay client — WebSocket connection to the relay /client endpoint.
 *
 * Auto-reconnects with exponential backoff.
 * Persists clientId in localStorage so the relay can resume the session.
 */

const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const PING_INTERVAL_MS = 30_000;
const CLIENT_ID_KEY = "alf_client_id";

export interface RelayClientConfig {
  url: string;
  token: string;
  onEvent: (msg: Record<string, unknown>) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export interface RelayClient {
  send(msg: object): void;
  connect(): void;
  disconnect(): void;
}

export function createRelayClient(config: RelayClientConfig): RelayClient {
  const { url, token, onEvent, onConnect, onDisconnect } = config;

  let ws: WebSocket | null = null;
  let backoffMs = BACKOFF_INITIAL_MS;
  let stopped = false;
  let authed = false;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  function getOrCreateClientId(): string {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const id = `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  }

  function sendRaw(msg: object) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function openSocket() {
    if (stopped) return;

    authed = false;
    const socket = new WebSocket(url);
    ws = socket;

    socket.onopen = () => {
      backoffMs = BACKOFF_INITIAL_MS;
      sendRaw({ type: "auth", token, clientId: getOrCreateClientId() });
      // Keepalive: prevent NAT/proxy/firewall from killing idle connection
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) sendRaw({ type: "ping" });
      }, PING_INTERVAL_MS);
    };

    socket.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(event.data as string); } catch { return; }

      if (msg.type === "connected" && !authed) {
        authed = true;
        onConnect();
        return;
      }

      onEvent(msg);
    };

    socket.onclose = () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      // Only act if this is still the active socket (not a stale replaced one)
      if (ws !== socket) return;
      ws = null;
      authed = false;
      onDisconnect();
      if (!stopped) {
        setTimeout(openSocket, backoffMs);
        backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
      }
    };

    socket.onerror = () => { /* onclose will fire after */ };
  }

  return {
    send(msg) { sendRaw(msg); },
    connect() { stopped = false; openSocket(); },
    disconnect() {
      stopped = true;
      ws?.close();
      ws = null;
    },
  };
}
