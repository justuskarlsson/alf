import { useScopedRequest, type ScopedRequest } from "./useScopedRequest";
import { useOnConnect } from "./useOnConnect";

/**
 * The canonical hook for panel initialization.
 *
 * Fires `cb` when the relay connects (and re-fires on reconnect).
 * The `request` passed to `cb` is scoped: if the panel unmounts before a
 * response arrives, the promise is silently abandoned. No stale writes.
 *
 * Panels should use this instead of calling useOnConnect directly.
 */
export function usePanelInit(cb: (request: ScopedRequest) => void) {
  const request = useScopedRequest();
  useOnConnect(() => cb(request));
}
