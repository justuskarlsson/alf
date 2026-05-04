/**
 * Alf Backend — connects to relay as a server, dispatches messages to modules.
 */

import { WebSocket } from "ws";
import { dispatch, initPush } from "./core/dispatch.js";
import { createLogger } from "./core/logger.js";
import { initDb } from "./core/db/index.js";

// Register all module handlers (side-effect imports)
import "./modules/repos/index.js";
import "./modules/files/index.js";
import "./modules/tickets/index.js";
import "./modules/git/index.js";
import "./modules/agents/index.js";
import "./core/transcription.js";
import { cleanupSubscriber } from "./modules/agents/index.js";

const log = createLogger("backend");

const RELAY_URL = process.env.RELAY_URL ?? "ws://localhost:3100";
const RELAY_TOKEN = process.env.RELAY_TOKEN ?? "dev-token";
const SERVER_NAME = process.env.SERVER_NAME ?? "";

const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const PING_INTERVAL_MS = 30_000;   // send ping every 30s to keep connection alive
const PONG_TIMEOUT_MS = 10_000;    // if no pong within 10s, consider connection dead

let ws: WebSocket | null = null;
let backoffMs = BACKOFF_INITIAL_MS;
let stopped = false;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let pongTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
}

function send(msg: object) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function connect() {
  if (stopped) return;

  const socket = new WebSocket(`${RELAY_URL}/server`);
  ws = socket;

  socket.on("open", () => {
    backoffMs = BACKOFF_INITIAL_MS;
    log.info("Connected to relay, authenticating");
    send({ type: "auth", token: RELAY_TOKEN, serverName: SERVER_NAME });

    // Keepalive: ping every 30s, terminate if no pong
    pingTimer = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.ping();
      pongTimer = setTimeout(() => {
        log.warn("Pong timeout — terminating stale connection");
        socket.terminate();
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  });

  socket.on("pong", () => {
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
  });

  socket.on("message", (data) => {
    const raw = data.toString();
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw); } catch { return; }
    // Relay system messages — not client requests
    if (msg.type === "connected") { log.info("Authenticated", { serverName: SERVER_NAME || "(default)" }); return; }
    if (msg.type === "client-connected" || msg.type === "clients-online") return;
    if (msg.type === "client-disconnected") {
      if (typeof msg.connectionId === "string") cleanupSubscriber(msg.connectionId);
      return;
    }
    dispatch(raw, send);
  });

  socket.on("close", () => {
    clearTimers();
    if (ws === socket) ws = null;
    log.warn(`Disconnected — reconnecting in ${backoffMs}ms`);
    if (!stopped) setTimeout(connect, backoffMs);
    backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
  });

  socket.on("error", (e) => { log.error("WS error", { error: String(e) }); });
}

process.on("SIGTERM", () => { stopped = true; ws?.close(); process.exit(0); });
process.on("SIGINT", () => { stopped = true; ws?.close(); process.exit(0); });

log.info(`Starting`, { relay: RELAY_URL, serverName: SERVER_NAME || "(default)" });

// In test env, wipe the DB before initialising so each run starts clean.
if (process.env.NODE_ENV === "test") {
  const dbPath = process.env.DB_PATH ?? "";
  if (dbPath && dbPath !== ":memory:") {
    const { rmSync } = await import("node:fs");
    for (const suffix of ["", "-shm", "-wal"]) {
      try { rmSync(dbPath + suffix); } catch { /* not found — fine */ }
    }
    log.info("Test mode: wiped DB", { dbPath });
  }
}

initDb();
initPush(send);
connect();
