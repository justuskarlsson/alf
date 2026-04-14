/**
 * Handler registry. Each module registers its type handlers here.
 * dispatch() is called with each raw WS message from a client.
 */

type Handler = (
  msg: Record<string, unknown>,
  reply: (response: object) => void
) => void;

const handlers = new Map<string, Handler>();

export function register(type: string, handler: Handler) {
  handlers.set(type, handler);
}

export function dispatch(raw: string, send: (msg: object) => void) {
  let msg: Record<string, unknown>;
  try { msg = JSON.parse(raw); } catch { return; }

  const { type, connectionId, requestId } = msg as {
    type?: string; connectionId?: string; requestId?: string;
  };

  if (!connectionId) return; // relay control messages (client-connected, etc.)

  const handler = handlers.get(type ?? "");
  if (!handler) {
    console.log(`[dispatch] unknown type: ${type}`);
    return;
  }

  handler(msg, (response) => send({ ...response, connectionId, requestId }));
}
