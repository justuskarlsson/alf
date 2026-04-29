/**
 * Agents module — WS handlers for agent/session/create, agent/message,
 * agent/subscribe, agent/unsubscribe, agent/sessions/list, agent/session/detail.
 * Handlers at top. Helpers below (hoisted).
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { handle, push, type Reply } from "../../core/dispatch.js";
import { ALF_DIR, REPOS_ROOT } from "../../core/config.js";
import { initSession, runTurn, type StreamSink } from "../../core/agents/index.js";
import { dbRepos, dbSessions, dbTurns, dbActivities } from "../../core/db/index.js";
import { testImpl } from "./implementations/test.js";
import { claudeCodeImpl } from "./implementations/claude-code.js";
import { createLogger } from "../../core/logger.js";
import type { ImplFn } from "../../core/agents/types.js";

const log = createLogger("agents");

/** sessionId → Set of subscriber connectionIds. */
const subscribers = new Map<string, Set<string>>();

/** sessionId → AbortController for the currently running turn. */
const runningTurns = new Map<string, AbortController>();

const IMPLS: Record<string, ImplFn> = {
  test: testImpl,
  "claude-code": claudeCodeImpl,
};

const DEFAULT_IMPL = process.env.DEFAULT_IMPL ?? "test";

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export class AgentsModule {
  /** Create a new empty session, or fork an existing one. */
  @handle("agent/session/create")
  static createSession(msg: Record<string, unknown>, reply: Reply) {
    const { repo, impl = DEFAULT_IMPL, forkedFrom } = msg as {
      repo?: string; impl?: string;
      forkedFrom?: { sessionId: string; turnIdx?: number };
    };

    // Fork path
    if (forkedFrom?.sessionId) {
      const session = dbSessions.fork(forkedFrom.sessionId, forkedFrom.turnIdx);
      reply({ type: "agent/session/create", sessionId: session.id });
      return;
    }

    // Normal create
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
    const { repo, sessionId, prompt, impl = DEFAULT_IMPL, model, files } = msg as {
      repo?: string; sessionId?: string; prompt?: string; impl?: string; model?: string;
      files?: { name: string; base64: string; mimeType: string }[];
    };
    const connectionId = msg.connectionId as string;

    if (!prompt) { reply({ type: "agent/message", error: "prompt required" }); return; }

    const sid = sessionId ?? (repo ? initSession(repo, impl) : null);
    if (!sid) { reply({ type: "agent/message", error: "repo or sessionId required" }); return; }

    // Save uploaded files to .alf/uploads/{sessionId}/ and build prompt suffix
    let fullPrompt = prompt;
    if (files?.length) {
      const session = dbSessions.get(sid);
      const repoRow = session ? dbRepos.get(session.repo_id) : null;
      if (repoRow) {
        const savedPaths = saveUploadedFiles(repoRow.path, sid, files);
        if (savedPaths.length) {
          fullPrompt += "\n\nAttached files:\n" + savedPaths.map(p => `- ${p}`).join("\n");
        }
      }
    }

    const implFn = IMPLS[impl] ?? testImpl;

    const sink: StreamSink = (delta) => {
      fanOut(sid, connectionId, { type: "agent/delta", ...delta });
    };

    const abort = new AbortController();
    runningTurns.set(sid, abort);

    const { done } = runTurn(sid, fullPrompt, implFn, sink, model, abort.signal);

    // Reply immediately — client needs sessionId to subscribe.
    // sdkSessionId is persisted to DB internally by runTurn (via session_ready event).
    reply({ type: "agent/message", sessionId: sid, status: "running" });

    done
      .then(() => fanOut(sid, connectionId, { type: "agent/turn/done", sessionId: sid }))
      .catch((err) => {
        // Aborted turns are expected — still send turn/done so frontend clears isRunning
        if (abort.signal.aborted) {
          fanOut(sid, connectionId, { type: "agent/turn/done", sessionId: sid });
          return;
        }
        log.error("runTurn failed", { error: String(err), sessionId: sid });
        push(connectionId, { type: "agent/error", sessionId: sid, error: String(err) });
      })
      .finally(() => runningTurns.delete(sid));
  }

  /** Subscribe to live deltas for a session. */
  @handle("agent/subscribe")
  static subscribe(msg: Record<string, unknown>, reply: Reply) {
    const { sessionId } = msg as { sessionId?: string };
    const connectionId = msg.connectionId as string;
    if (!sessionId) { reply({ type: "agent/subscribe", error: "sessionId required" }); return; }
    if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
    subscribers.get(sessionId)!.add(connectionId);
    reply({ type: "agent/subscribe", sessionId, status: "subscribed" });
  }

  /** Unsubscribe from live deltas for a session. */
  @handle("agent/unsubscribe")
  static unsubscribe(msg: Record<string, unknown>, reply: Reply) {
    const { sessionId } = msg as { sessionId?: string };
    const connectionId = msg.connectionId as string;
    if (!sessionId) { reply({ type: "agent/unsubscribe", error: "sessionId required" }); return; }
    subscribers.get(sessionId)?.delete(connectionId);
    reply({ type: "agent/unsubscribe", sessionId, status: "unsubscribed" });
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

  /** Delete a session and all associated data. */
  @handle("agent/session/delete")
  static deleteSession(msg: Record<string, unknown>, reply: Reply) {
    const { sessionId } = msg as { sessionId?: string };
    if (!sessionId) { reply({ type: "agent/session/delete", error: "sessionId required" }); return; }
    // Clean up subscribers for this session
    subscribers.delete(sessionId);
    dbSessions.delete(sessionId);
    reply({ type: "agent/session/delete", ok: true });
  }

  /** Stop a running turn for a session. */
  @handle("agent/stop")
  static stop(msg: Record<string, unknown>, reply: Reply) {
    const { sessionId } = msg as { sessionId?: string };
    if (!sessionId) { reply({ type: "agent/stop", error: "sessionId required" }); return; }
    const abort = runningTurns.get(sessionId);
    if (abort) {
      abort.abort(new Error("User stopped the turn"));
      runningTurns.delete(sessionId);
      log.info("Turn stopped", { sessionId });
    }
    reply({ type: "agent/stop", ok: true });
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

/** Save uploaded files to ALF_DIR/uploads/{sessionId}/ in the repo. Returns saved paths. */
function saveUploadedFiles(
  repoPath: string,
  sessionId: string,
  files: { name: string; base64: string; mimeType: string }[],
): string[] {
  const repoDir = join(REPOS_ROOT, repoPath);
  const alfDir = join(repoDir, ALF_DIR);
  const uploadsDir = join(alfDir, "uploads", sessionId);

  // Ensure alf structure exists
  mkdirSync(uploadsDir, { recursive: true });
  ensureAlfGitignore(alfDir);

  const savedPaths: string[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = join(uploadsDir, uniqueName(uploadsDir, safeName));
    writeFileSync(filePath, Buffer.from(file.base64, "base64"));
    savedPaths.push(filePath);
    log.info("File saved", { name: file.name, path: filePath });
  }
  return savedPaths;
}

/** Ensure .alf/.gitignore exists with uploads/ entry. */
function ensureAlfGitignore(alfDir: string): void {
  const gitignorePath = join(alfDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, "uploads/\n");
  }
}

/** Return a filename that doesn't collide with existing files in dir. */
function uniqueName(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 1;
  while (existsSync(join(dir, `${stem}-${i}${ext}`))) i++;
  return `${stem}-${i}${ext}`;
}
