import { useGlobalStore } from "./globalStore";

/** Current active repo — workspace-level. */
export function useRepo(): string | null {
  return useGlobalStore(s => s.repo);
}
