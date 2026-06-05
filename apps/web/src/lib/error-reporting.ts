/**
 * Env-gated error reporting for the web app. Isomorphic (server + client) and dependency-free:
 * it always routes through the shared structured logger so errors are captured in one JSON shape,
 * and it surfaces whether an external sink (Sentry) is *configured* without requiring its SDK.
 *
 * Design (mirrors the /api/ai 503-degrade philosophy):
 *  - With no SENTRY_DSN set, this is a no-op beyond a structured `error`-level log line.
 *  - When SENTRY_DSN is set, the log line carries `sink: "sentry"` so ops can see intent; wiring the
 *    actual @sentry/nextjs transport is user-owned (keeps the app dependency-light by default).
 *  - reportError NEVER throws — a failure in reporting must not mask the original error.
 *
 * Never pass secrets (keys, signatures, raw request bodies) in `context`.
 */

import { createLogger } from "@interlock/shared";

const log = createLogger("web:error");

/** True when an external error sink is configured (server-only env — always false in the browser). */
export function errorReportingConfigured(): boolean {
  if (typeof process === "undefined") return false;
  return Boolean(process.env.SENTRY_DSN?.trim());
}

type ErrorContext = Record<string, unknown> & { digest?: string };

/** Capture an error. Safe to call from server routes, client error boundaries, and effects. */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  try {
    const normalized = normalize(error);
    log.error(normalized.message, {
      name: normalized.name,
      stack: normalized.stack,
      sink: errorReportingConfigured() ? "sentry" : "log",
      ...context,
    });
  } catch {
    // Reporting must never throw or mask the original failure.
  }
}

function normalize(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message || "Unknown error",
      // Truncate to keep log lines bounded; full traces belong in the external sink.
      stack: error.stack?.split("\n").slice(0, 12).join("\n"),
    };
  }
  return { name: "NonError", message: typeof error === "string" ? error : JSON.stringify(error) };
}
