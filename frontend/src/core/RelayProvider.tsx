import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRelayClient, type RelayClient } from "../lib/relay";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventHandler = (msg: Record<string, unknown>) => void;

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface RelayContextValue {
  isConnected: boolean;
  /** Send a request and await the matching response (matched by requestId). */
  request: <T>(msg: object, timeout?: number) => Promise<T>;
  /** Subscribe to push events by type. Returns unsubscribe fn. */
  subscribe: (type: string, handler: EventHandler) => () => void;
  /** Register a callback to run when relay connects (or immediately if already connected). Returns unsubscribe fn. */
  onConnect: (cb: () => void) => () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RelayContext = createContext<RelayContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface Props {
  url: string;
  token: string;
  children: React.ReactNode;
}

export function RelayProvider({ url, token, children }: Props) {
  const [isConnected, setIsConnected] = useState(false);
  const isConnectedRef = useRef(false);
  const clientRef = useRef<RelayClient | null>(null);
  const pendingRef = useRef(new Map<string, Pending>());
  const subscribersRef = useRef(new Map<string, Set<EventHandler>>());
  const connectHandlersRef = useRef(new Set<() => void>());

  // Empty deps: url/token come from static env vars and never change.
  // If reconnection with new credentials is ever needed, expose a reconnect() action.
  useEffect(() => {
    const client = createRelayClient({
      url,
      token,
      onEvent(msg) {
        // 1. Request/response: match by requestId
        const rid = msg.requestId as string | undefined;
        if (rid) {
          const pending = pendingRef.current.get(rid);
          if (pending) {
            pendingRef.current.delete(rid);
            clearTimeout(pending.timer);
            if (msg.type === "error") pending.reject(new Error(String(msg.error ?? "error")));
            else pending.resolve(msg);
            return;
          }
        }
        // 2. Push event: dispatch to type subscribers
        const type = msg.type as string | undefined;
        if (type) subscribersRef.current.get(type)?.forEach(h => h(msg));
      },
      onConnect() {
        isConnectedRef.current = true;
        setIsConnected(true);
        connectHandlersRef.current.forEach(cb => cb());
      },
      onDisconnect() {
        isConnectedRef.current = false;
        setIsConnected(false);
        for (const [, p] of pendingRef.current) { clearTimeout(p.timer); p.reject(new Error("Disconnected")); }
        pendingRef.current.clear();
      },
    });

    clientRef.current = client;
    client.connect();
    return () => { client.disconnect(); clientRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const request = useCallback(<T,>(msg: object, timeout = 10_000): Promise<T> => {
    return new Promise((resolve, reject) => {
      const requestId = `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const timer = setTimeout(() => {
        pendingRef.current.delete(requestId);
        reject(new Error(`WS timeout: ${(msg as Record<string, unknown>).type}`));
      }, timeout);
      pendingRef.current.set(requestId, { resolve: resolve as (v: unknown) => void, reject, timer });
      clientRef.current?.send({ ...msg, requestId });
    });
  }, []);

  const subscribe = useCallback((type: string, handler: EventHandler) => {
    if (!subscribersRef.current.has(type)) subscribersRef.current.set(type, new Set());
    subscribersRef.current.get(type)!.add(handler);
    return () => { subscribersRef.current.get(type)?.delete(handler); };
  }, []);

  const onConnect = useCallback((cb: () => void) => {
    connectHandlersRef.current.add(cb);
    // Call immediately if already connected — handles late registration after mount
    if (isConnectedRef.current) cb();
    return () => { connectHandlersRef.current.delete(cb); };
  }, []);

  return (
    <RelayContext.Provider value={{ isConnected, request, subscribe, onConnect }}>
      {children}
    </RelayContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRelay(): RelayContextValue {
  const ctx = useContext(RelayContext);
  if (!ctx) throw new Error("useRelay must be used inside <RelayProvider>");
  return ctx;
}
