/**
 * Alf Backend — connects to relay as a server, dispatches messages to modules.
 */

import { WebSocket } from "ws";
import { dispatch } from "./core/dispatch.js";

// Register all module handlers (side-effect imports)
import "./modules/repos/index.js";
import "./modules/files/index.js";

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
      log("Authenticated", { serverName: SERVER_NAME || "(default)" });
      return;
    }
    dispatch(raw, send);
  });

  ws.on("close", () => {
    ws = null;
    log(`Disconnected — reconnecting in ${backoffMs}ms`);
    if (!stopped) setTimeout(connect, backoffMs);
    backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
  });

  ws.on("error", (e) => { log("WS error", { error: String(e) }); });
}

process.on("SIGTERM", () => { stopped = true; ws?.close(); process.exit(0); });
process.on("SIGINT", () => { stopped = true; ws?.close(); process.exit(0); });

log(`Alf Backend  relay=${RELAY_URL}  serverName=${SERVER_NAME || "(default)"}`);
connect();
