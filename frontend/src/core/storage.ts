/**
 * Centralized localStorage access for all module stores.
 * All keys are prefixed with "alf:". Modules should use this
 * rather than calling localStorage directly.
 */

const PREFIX = "alf:";

export const storage = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw !== null ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  },
  set<T>(key: string, value: T): void {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* quota or private browsing */ }
  },
  remove(key: string): void {
    try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  },
};
