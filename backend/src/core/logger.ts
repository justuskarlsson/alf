type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = (process.env.LOG_LEVEL ?? "info") as Level;

function shouldLog(level: Level): boolean {
  return LEVEL_RANK[level] >= (LEVEL_RANK[MIN_LEVEL] ?? 1);
}

function format(level: Level, tag: string, msg: string, data?: Record<string, unknown>): string {
  const ts = new Date().toISOString().slice(11, 23);
  const suffix = data ? ` ${JSON.stringify(data)}` : "";
  return `[${ts}] ${level.toUpperCase().padEnd(5)} [${tag}] ${msg}${suffix}`;
}

export function createLogger(tag: string) {
  return {
    debug: (msg: string, data?: Record<string, unknown>) => { if (shouldLog("debug")) console.log(format("debug", tag, msg, data)); },
    info:  (msg: string, data?: Record<string, unknown>) => { if (shouldLog("info"))  console.log(format("info",  tag, msg, data)); },
    warn:  (msg: string, data?: Record<string, unknown>) => { if (shouldLog("warn"))  console.warn(format("warn",  tag, msg, data)); },
    error: (msg: string, data?: Record<string, unknown>) => { if (shouldLog("error")) console.error(format("error", tag, msg, data)); },
  };
}
