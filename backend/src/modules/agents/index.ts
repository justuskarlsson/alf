/**
 * Agents module — WS handlers for agent/session/create, agent/message, agent/stream.
 * Handlers at top. Helpers below (hoisted).
 */

import { handle, push, type Reply } from "../../core/dispatch.js";
import { initSession, runTurn, type StreamSink } from "../../core/agents/index.js";
import { dbRepos, dbSessions, dbTurns, dbActivities } from "../../core/db/index.js";
import { testImpl } from "./implementations/test.js";
import { createLogger } from "../../core/logger.js";
import type { ImplFn } from "../../core/agents/types.js";

const log = createLogger("agents");

/** sessionId → Set of subscriber connectionIds. */
const subscribers = new Map<string, Set<string>>();

const IMPLS: Record<string, ImplFn> = {
  test: testImpl,
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export class AgentsModule {
  /** Create a new empty session without sending a message. */
  @handle("agent/session/create")
  static createSession(msg: Record<string, unknown>, reply: Reply) {
    const { repo, impl = "test" } = msg as { repo?: string; impl?: string };
    if (!repo) { reply({ type: "agent/session/create", error: "repo required" }); return; }
    const sessionId = initSession(repo, impl);
    reply({ type: "agent/session/create", sessionId });
  }

  /**
   * Send a message to an agent.
   * Creates a new session if no sessionId given (requires repo).
   * Acknowledges immediately, then streams deltas and sends turn/done when complete.
   */
  @handle("agent/message")
  static message(msg: Record<string, unknown>, reply: Reply) {
    const { repo, sessionId, prompt, impl = "test" } = msg as {
      repo?: string; sessionId?: string; prompt?: string; impl?: string;
    };
    const connectionId = msg.connectionId as string;

    if (!prompt) { reply({ type: "agent/message", error: "prompt required" }); return; }

    const sid = sessionId ?? (repo ? initSession(repo, impl) : null);
    if (!sid) { reply({ type: "agent/message", error: "repo or sessionId required" }); return; }

    const implFn = IMPLS[impl] ?? testImpl;

    // Ack immediately — the rest is async
    reply({ type: "agent/message", sessionId: sid, status: "running" });

    const sink: StreamSink = (delta) => {
      fanOut(sid, connectionId, { type: "agent/delta", ...delta });
    };

    runTurn(sid, prompt, implFn, sink)
      .then(() => fanOut(sid, connectionId, { type: "agent/turn/done", sessionId: sid }))
      .catch((err) => {
        log.error("runTurn failed", { error: String(err), sessionId: sid });
        push(connectionId, { type: "agent/error", sessionId: sid, error: String(err) });
      });
  }

  /** Subscribe / unsubscribe to live deltas for a session. */
  @handle("agent/stream")
  static stream(msg: Record<string, unknown>, reply: Reply) {
    const { sessionId, action = "subscribe" } = msg as { sessionId?: string; action?: string };
    const connectionId = msg.connectionId as string;

    if (!sessionId) { reply({ type: "agent/stream", error: "sessionId required" }); return; }

    if (action === "subscribe") {
      if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
      subscribers.get(sessionId)!.add(connectionId);
      reply({ type: "agent/stream", sessionId, status: "subscribed" });
    } else {
      subscribers.get(sessionId)?.delete(connectionId);
      reply({ type: "agent/stream", sessionId, status: "unsubscribed" });
    }
  }

  /** List sessions for a repo (by path — upserts repo row if needed). */
  @handle("agent/sessions/list")
  static listSessions(msg: Record<string, unknown>, reply: Reply) {
    const { repo } = msg as { repo?: string };
    if (!repo) { reply({ type: "agent/sessions/list", error: "repo required" }); return; }
    const repoRow = dbRepos.upsert(repo);
    const sessions = dbSessions.list(repoRow.id);
    reply({ type: "agent/sessions/list", sessions });
  }

  /** Rename or update a session. */
  @handle("agent/session/update")
  static updateSession(msg: Record<string, unknown>, reply: Reply) {
    const { sessionId, title } = msg as { sessionId?: string; title?: string };
    if (!sessionId) { reply({ type: "agent/session/update", error: "sessionId required" }); return; }
    if (title !== undefined) dbSessions.update(sessionId, { title });
    reply({ type: "agent/session/update", ok: true });
  }

  /** Full turn + activity history for a session, with optional replay (lastActivityIdx). */
  @handle("agent/session/detail")
  static detail(msg: Record<string, unknown>, reply: Reply) {
    const { sessionId, afterTurnIdx, afterActivityIdx } = msg as {
      sessionId?: string; afterTurnIdx?: number; afterActivityIdx?: number;
    };
    if (!sessionId) { reply({ type: "agent/session/detail", error: "sessionId required" }); return; }
    const session = dbSessions.get(sessionId);
    if (!session) { reply({ type: "agent/session/detail", error: "not found" }); return; }
    // Always return all turns (cheap). Activities: full or since composite cursor (afterTurnIdx, afterActivityIdx).
    const turns = dbTurns.list(sessionId);
    const activities = (afterTurnIdx !== undefined && afterActivityIdx !== undefined)
      ? dbActivities.listSince(sessionId, afterTurnIdx, afterActivityIdx)
      : dbActivities.listForSession(sessionId);
    const lastCoord = dbActivities.lastCoord(sessionId);
    reply({ type: "agent/session/detail", session, turns, activities, lastCoord });
  }
}

/** Remove a disconnected client from all session subscriptions. */
export function cleanupSubscriber(connectionId: string): void {
  for (const subs of subscribers.values()) subs.delete(connectionId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Send msg to all subscribers of sessionId, plus the sender connectionId as fallback. */
function fanOut(sessionId: string, senderConnectionId: string, msg: object): void {
  const subs = subscribers.get(sessionId);
  const targets = subs && subs.size > 0 ? subs : new Set([senderConnectionId]);
  for (const cid of targets) push(cid, msg);
}
