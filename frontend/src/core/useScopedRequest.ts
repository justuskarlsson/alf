import { useCallback, useEffect, useRef } from "react";
import { useRelay } from "./RelayProvider";

/**
 * Returns a `request` function scoped to the current component's lifetime.
 * If the component unmounts before a response arrives, the promise is silently
 * abandoned — no stale state writes, no error logs for expected cancellations.
 */
export type ScopedRequest = <T>(msg: Record<string, unknown>, timeout?: number) => Promise<T>;

export function useScopedRequest(): ScopedRequest {
  const { request } = useRelay();
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true; // Reset on remount (handles React StrictMode double-invoke)
    return () => { aliveRef.current = false; };
  }, []);

  return useCallback(<T,>(msg: Record<string, unknown>, timeout?: number): Promise<T> => {
    return new Promise((resolve, reject) => {
      request<T>(msg, timeout).then(
        res => { if (aliveRef.current) resolve(res); },
        err => { if (aliveRef.current) reject(err); },
      );
    });
  }, [request]);
}
