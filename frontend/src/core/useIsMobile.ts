import { useSyncExternalStore } from "react";

const query = "(max-width: 768px)";
const mql = typeof window !== "undefined" ? window.matchMedia(query) : null;

function subscribe(cb: () => void) {
  mql?.addEventListener("change", cb);
  return () => mql?.removeEventListener("change", cb);
}
function getSnapshot() { return mql?.matches ?? false; }

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
