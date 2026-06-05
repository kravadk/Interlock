/**
 * Tiny structured logger shared across server-side Interlock surfaces (indexer, web API routes).
 * One JSON line per call: { ts, level, name, msg, ...fields }. Level gated by LOG_LEVEL
 * (debug < info < warn < error; default "info"). No Node-only APIs — safe wherever `console` exists.
 * Never log secrets (keys, signatures, raw request bodies) — pass only safe fields.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const raw = typeof process !== "undefined" ? process.env?.LOG_LEVEL?.toLowerCase() : undefined;
  return raw && raw in ORDER ? ORDER[raw as LogLevel] : ORDER.info;
}

export type Logger = Record<LogLevel, (msg: string, fields?: Record<string, unknown>) => void>;

export function createLogger(name: string): Logger {
  const emit = (level: LogLevel) => (msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < threshold()) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level, name, msg, ...(fields ?? {}) });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
  return { debug: emit("debug"), info: emit("info"), warn: emit("warn"), error: emit("error") };
}

/** Short random id for correlating a single request across its log lines. */
export function requestId(): string {
  return Math.random().toString(36).slice(2, 10);
}
