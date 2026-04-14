/**
 * Alf Backend
 *
 * Connects to relay as a server. Handles WS messages from clients:
 *   repos/list  → { repos: string[] }
 *   files/list  → { repo: string } → { files: FileEntry[] }
 *
 * requestId is echoed back so the client can match responses to requests.
 */

import { WebSocket } from "ws";
import { listRepos, listFiles } from "./handlers.js";

const RELAY_URL = process.env.RELAY_URL ?? "ws://localhost:3100";
const RELAY_TOKEN = process.env.RELAY_TOKEN ?? "dev-token";
const SERVER_NAME = process.env.SERVER_NAME ?? "";

const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30000;

let ws: WebSocket | null = null;
let backoffMs = BACKOFF_INITIAL_MS;
let stopped = false;

function log(msg: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(data ? `[${ts}] ${msg} ${JSON.stringify(data)}` : `[${ts}] ${msg}`);
}

function send(msg: object) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handle(raw: string) {
  let msg: Record<string, unknown>;
  try { msg = JSON.parse(raw); } catch { return; }

  const { type, connectionId, requestId } = msg as {
    type?: string;
    connectionId?: string;
    requestId?: string;
  };

  if (!connectionId) return; // relay control messages (client-connected etc.) — ignore

  switch (type) {
    case "repos/list": {
      const repos = listRepos();
      send({ type: "repos/list", connectionId, requestId, repos });
      break;
    }
    case "files/list": {
      const repo = msg.repo as string | undefined;
      if (!repo) {
        send({ type: "error", connectionId, requestId, error: "Missing repo" });
        return;
      }
      const files = listFiles(repo);
      send({ type: "files/list", connectionId, requestId, files });
      break;
    }
    default:
      log("Unknown message type", { type, connectionId });
  }
}

function connect() {
  if (stopped) return;

  ws = new WebSocket(`${RELAY_URL}/server`);

  ws.on("open", () => {
    backoffMs = BACKOFF_INITIAL_MS;
    log("Connected to relay, authenticating");
    send({ type: "auth", token: RELAY_TOKEN, serverName: SERVER_NAME });
  });

  ws.on("message", (data) => {
    const raw = data.toString();
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "connected") {
      log("Authenticated with relay", { serverName: SERVER_NAME || "(default)" });
      return;
    }

    handle(raw);
  });

  ws.on("close", () => {
    ws = null;
    log(`Disconnected — reconnecting in ${backoffMs}ms`);
    if (!stopped) setTimeout(connect, backoffMs);
    backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
  });

  ws.on("error", (e) => {
    log("WS error", { error: String(e) });
  });
}

process.on("SIGTERM", () => { stopped = true; ws?.close(); process.exit(0); });
process.on("SIGINT", () => { stopped = true; ws?.close(); process.exit(0); });

log(`Alf Backend  relay=${RELAY_URL}  serverName=${SERVER_NAME || "(default)"}`);
connect();
