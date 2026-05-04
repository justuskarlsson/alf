/**
 * Alf Relay — WebSocket Router
 *
 * Endpoints:
 *   /client  — Frontend apps
 *   /server  — Backend
 *
 * Auth flow:
 *   1. Connect
 *   2. Send { type: "auth", token: "...", clientId?: "..." }
 *   3. Receive { type: "connected", connectionId: "..." }
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { WSContext } from "hono/ws";
import crypto from "crypto";

// --- State ---

const clients = new Map<string, WSContext>();
const pendingAuth = new Set<WSContext>();
const clientIds = new Map<WSContext, string>();

interface ServerEntry { ws: WSContext; authed: boolean }
const servers = new Map<string, ServerEntry>();
const clientServerName = new Map<string, string>();

// --- Config ---

const RELAY_TOKEN = process.env.RELAY_TOKEN ?? "dev-token";
const PORT = parseInt(process.env.RELAY_PORT ?? "3100", 10);
const AUTH_TIMEOUT_MS = 5000;

// --- Helpers ---

function log(msg: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(data ? `[${ts}] ${msg} ${JSON.stringify(data)}` : `[${ts}] ${msg}`);
}

function sendJson(ws: WSContext, msg: object) {
  try { ws.send(JSON.stringify(msg)); } catch { /* ignore closed socket */ }
}

// --- App ---

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get("/health", (c) => {
  const serverStatus: Record<string, boolean> = {};
  for (const [name, entry] of servers) serverStatus[name || "(default)"] = entry.authed;
  return c.json({ ok: true, clients: clients.size, servers: serverStatus });
});

// --- Server endpoint ---

app.get("/server", upgradeWebSocket(() => {
  let claimedName: string | null = null;

  return {
    onOpen(_, ws) {
      log("Server connected (awaiting auth)");
      setTimeout(() => {
        if (claimedName === null) { log("Server auth timeout"); ws.close(4001, "Auth timeout"); }
      }, AUTH_TIMEOUT_MS);
    },

    onMessage(event, ws) {
      const data = typeof event.data === "string" ? event.data : event.data.toString();
      try {
        const msg = JSON.parse(data);

        if (claimedName === null) {
          if (msg.type === "auth" && msg.token === RELAY_TOKEN) {
            const serverName: string = msg.serverName ?? "";
            if (servers.has(serverName)) {
              sendJson(ws, { type: "error", error: "Server name already connected" });
              ws.close(4003, "Server name already connected");
              return;
            }
            claimedName = serverName;
            servers.set(serverName, { ws, authed: true });
            log("Server authenticated", { serverName: serverName || "(default)" });
            sendJson(ws, { type: "connected" });

            // Notify waiting clients
            const onlineIds: string[] = [];
            for (const [connId, client] of clients) {
              if ((clientServerName.get(connId) ?? "") === serverName) {
                sendJson(client, { type: "server-connected" });
                onlineIds.push(connId);
              }
            }
            if (onlineIds.length > 0) sendJson(ws, { type: "clients-online", clientIds: onlineIds });
          } else {
            sendJson(ws, { type: "error", error: "Invalid token" });
            ws.close(4001, "Invalid token");
          }
          return;
        }

        // Route to client by connectionId
        const connectionId = msg.connectionId;
        if (!connectionId) { log("Server message missing connectionId"); return; }
        const client = clients.get(connectionId);
        if (client) { try { client.send(data); } catch { /* ignore */ } }
        else log("Client not found", { connectionId });
      } catch { log("Invalid JSON from server"); }
    },

    onClose() {
      if (claimedName !== null) {
        log("Server disconnected", { serverName: claimedName || "(default)" });
        servers.delete(claimedName);
        for (const [connId, client] of clients) {
          if ((clientServerName.get(connId) ?? "") === claimedName)
            sendJson(client, { type: "server-disconnected" });
        }
      }
    },
  };
}));

// --- Client endpoint ---

app.get("/client", upgradeWebSocket(() => {
  return {
    onOpen(_, ws) {
      log("Client connected (awaiting auth)");
      pendingAuth.add(ws);
      setTimeout(() => {
        if (pendingAuth.has(ws)) { log("Client auth timeout"); pendingAuth.delete(ws); ws.close(4001, "Auth timeout"); }
      }, AUTH_TIMEOUT_MS);
    },

    onMessage(event, ws) {
      const data = typeof event.data === "string" ? event.data : event.data.toString();
      try {
        const msg = JSON.parse(data);

        if (pendingAuth.has(ws)) {
          if (msg.type === "auth" && msg.token === RELAY_TOKEN) {
            pendingAuth.delete(ws);
            const connectionId = msg.clientId ?? crypto.randomUUID();
            const targetServer: string = msg.serverName ?? "";

            // Replace existing connection with same clientId.
            // Don't close() the old socket — that triggers the browser's onclose
            // → reconnect → replace loop.  Just orphan it; it'll die on its own.
            const existing = clients.get(connectionId);
            if (existing && existing !== ws) {
              clientIds.delete(existing);
            }

            clients.set(connectionId, ws);
            clientIds.set(ws, connectionId);
            clientServerName.set(connectionId, targetServer);
            log("Client authenticated", { connectionId, targetServer: targetServer || "(default)" });
            sendJson(ws, { type: "connected", connectionId });

            const entry = servers.get(targetServer);
            if (entry?.authed) {
              sendJson(entry.ws, { type: "client-connected", connectionId });
              sendJson(ws, { type: "server-connected" });
            }
          } else {
            pendingAuth.delete(ws);
            sendJson(ws, { type: "error", error: "Invalid token" });
            ws.close(4001, "Invalid token");
          }
          return;
        }

        const connectionId = clientIds.get(ws);
        if (!connectionId) { ws.close(4001, "Not authenticated"); return; }

        if (msg.type === "ping") { sendJson(ws, { type: "pong", connectionId }); return; }

        const target = clientServerName.get(connectionId) ?? "";
        const targetEntry = servers.get(target);
        if (targetEntry?.authed) {
          try { targetEntry.ws.send(JSON.stringify({ ...msg, connectionId })); } catch { /* ignore */ }
        } else {
          sendJson(ws, { type: "error", connectionId, error: "Server not connected" });
        }
      } catch { log("Invalid JSON from client"); }
    },

    onClose(_, ws) {
      pendingAuth.delete(ws);
      const connectionId = clientIds.get(ws);
      if (connectionId) {
        const target = clientServerName.get(connectionId) ?? "";
        clients.delete(connectionId);
        clientIds.delete(ws);
        clientServerName.delete(connectionId);
        log("Client disconnected", { connectionId });
        servers.get(target)?.authed && sendJson(servers.get(target)!.ws, { type: "client-disconnected", connectionId });
      }
    },
  };
}));

// --- Start ---

const httpServer = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`\nAlf Relay  http://localhost:${info.port}/health`);
  console.log(`  /client — frontend`);
  console.log(`  /server — backend\n`);
});

injectWebSocket(httpServer);
