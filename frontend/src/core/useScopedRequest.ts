import { useCallback, useEffect, useRef } from "react";
import { useRelay } from "./RelayProvider";

/**
 * Returns a `request` function scoped to the current component's lifetime.
 * If the component unmounts before a response arrives, the promise rejects
 * with `ScopedRequestCancelledError` so callers can distinguish cancellation
 * from real errors and clean up loading state.
 */
export type ScopedRequest = <T>(msg: Record<string, unknown>, timeout?: number) => Promise<T>;

export class ScopedRequestCancelledError extends Error {
  constructor() { super("Request cancelled: component unmounted"); this.name = "ScopedRequestCancelledError"; }
}

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
        res => { if (aliveRef.current) resolve(res); else reject(new ScopedRequestCancelledError()); },
        err => { if (aliveRef.current) reject(err); else reject(new ScopedRequestCancelledError()); },
      );
    });
  }, [request]);
}
