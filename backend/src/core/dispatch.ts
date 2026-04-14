/**
 * Handler registry + @handle decorator.
 * dispatch() routes incoming WS messages to registered handlers.
 */

import { createLogger } from "./logger.js";

const log = createLogger("dispatch");

export type Reply = (response: object) => void;
export type Handler = (msg: Record<string, unknown>, reply: Reply) => void;

const handlers = new Map<string, Handler>();

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
    log.warn("Unknown message type", { type, connectionId });
    return;
  }

  handler(msg, (response) => send({ ...response, connectionId, requestId }));
}
