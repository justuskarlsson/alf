/**
 * Handler registry + @handle decorator.
 * dispatch() routes incoming WS messages to registered handlers.
 */

import { createLogger } from "./logger.js";

const log = createLogger("dispatch");

export type Reply = (response: object) => void;
export type Handler = (msg: Record<string, unknown>, reply: Reply) => void;

const handlers = new Map<string, Handler>();

// Module-level send for pushing to arbitrary connectionIds (e.g. stream subscribers).
let _push: ((msg: object) => void) | null = null;

/** Called once at startup with the relay send function. */
export function initPush(fn: (msg: object) => void): void {
  _push = fn;
}

/** Push a message to any connectionId, bypassing the request/reply cycle. */
export function push(connectionId: string, msg: object): void {
  _push?.({ ...msg, connectionId });
}

export function register(type: string, handler: Handler) {
  handlers.set(type, handler);
}

/**
 * Decorator that registers a static class method as a WS message handler.
 *
 * @example
 * class MyModule {
 *   @handle("my/type")
 *   static action(msg, reply) { ... }
 * }
 */
export function handle(type: string) {
  return function (_target: object, _key: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    register(type, descriptor.value as Handler);
    return descriptor;
  };
}

export function dispatch(raw: string, send: (msg: object) => void) {
  let msg: Record<string, unknown>;
  try { msg = JSON.parse(raw); } catch { return; }

  const { type, connectionId, requestId } = msg as {
    type?: string; connectionId?: string; requestId?: string;
  };

  if (!connectionId) return; // relay control messages

  const handler = handlers.get(type ?? "");
  if (!handler) {
    log.warn("Unknown type", { type, connectionId });
    return;
  }

  const payload = omit(msg, "type", "connectionId", "requestId");
  log.info(`→ ${type}`, Object.keys(payload).length ? truncate(payload) : undefined);
  handler(msg, (response) => {
    const resPayload = omit(response as Record<string, unknown>, "connectionId", "requestId");
    log.info(`← ${type}`, truncate(resPayload));
    send({ ...response, connectionId, requestId });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_VAL = 120;

function omit(obj: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!keys.includes(k)) out[k] = v;
  }
  return out;
}

function truncate(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    out[k] = s && s.length > MAX_VAL ? s.slice(0, MAX_VAL) + "…" : v;
  }
  return out;
}
