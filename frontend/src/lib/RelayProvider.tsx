import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRelayClient, type RelayClient } from "./relay";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface RelayContextValue {
  isConnected: boolean;
  request: <T>(msg: object, timeout?: number) => Promise<T>;
}

const RelayContext = createContext<RelayContextValue | null>(null);

interface Props {
  url: string;
  token: string;
  children: React.ReactNode;
}

export function RelayProvider({ url, token, children }: Props) {
  const [isConnected, setIsConnected] = useState(false);
  const clientRef = useRef<RelayClient | null>(null);
  const pendingRef = useRef(new Map<string, Pending>());

  useEffect(() => {
    const client = createRelayClient({
      url,
      token,
      onEvent(msg) {
        const rid = msg.requestId as string | undefined;
        if (rid) {
          const pending = pendingRef.current.get(rid);
          if (pending) {
            pendingRef.current.delete(rid);
            clearTimeout(pending.timer);
            if (msg.type === "error") pending.reject(new Error(String(msg.error ?? "Unknown error")));
            else pending.resolve(msg);
            return;
          }
        }
        // Non-request events — ignored for now (push events will go here later)
      },
      onConnect() { setIsConnected(true); },
      onDisconnect() {
        setIsConnected(false);
        for (const [, p] of pendingRef.current) { clearTimeout(p.timer); p.reject(new Error("Disconnected")); }
        pendingRef.current.clear();
      },
    });

    clientRef.current = client;
    client.connect();
    return () => { client.disconnect(); clientRef.current = null; };
  }, [url, token]);

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

  return (
    <RelayContext.Provider value={{ isConnected, request }}>
      {children}
    </RelayContext.Provider>
  );
}

export function useRelay(): RelayContextValue {
  const ctx = useContext(RelayContext);
  if (!ctx) throw new Error("useRelay must be used inside <RelayProvider>");
  return ctx;
}
