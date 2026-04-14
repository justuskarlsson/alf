import { useEffect } from "react";
import { useRelay } from "./RelayProvider";

/**
 * Register a callback to run when the relay connects.
 * If already connected at mount time, fires immediately.
 * Also re-fires on reconnect (e.g. after network hiccup), so use to re-fetch data.
 */
export function useOnConnect(cb: () => void) {
  const { onConnect } = useRelay();
  useEffect(() => {
    return onConnect(cb);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
