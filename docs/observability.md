# Observability

How to monitor a running Interlock deployment: health, metrics, logs, and the CLI doctor.

## Health endpoints

| Surface | Endpoint | Returns |
| --- | --- | --- |
| Indexer | `GET /health` | `ok`, `nextFromBlock`, `lastSyncError`, `lastSynced*`, `autoSync`, `syncing`, `storage`. |
| Indexer | `GET /status` | Recorder status: network, contracts, sync state, record counts. |
| Web | `GET /api/health` | `ok`, configured contracts (booleans), server-key **presence** booleans (`ai`/`attestor`/`demo` — never values), and indexer reachability. Sets an `x-request-id` header. |

```bash
curl http://localhost:8787/health
curl http://localhost:3000/api/health
```

`/api/health` is intentionally not rate-limited so uptime checks keep working during incidents.

## Web API Rate Limits

The web API applies a small in-memory token bucket to high-cost/write-like routes:

| Route | Env override | Default |
| --- | --- | --- |
| `POST /api/ai` | `RATE_LIMIT_AI_RPM` | `20` requests/min/IP |
| `POST /api/attest` | `RATE_LIMIT_ATTEST_RPM` | `30` requests/min/IP |
| `POST /api/demo/run` | `RATE_LIMIT_DEMO_RPM` | `10` requests/min/IP |
| `POST /api/rpc` | `RATE_LIMIT_RPC_RPM` | `120` requests/min/IP |

`RATE_LIMIT_RPM` is the shared fallback and `RATE_LIMIT_DISABLED=true` disables the limiter for
local diagnostics. This is a coarse per-instance dampener: it resets on cold start and does not
coordinate across multiple Vercel/Node instances. Use a managed shared limiter such as Upstash/KV
before making production abuse-resistance claims.

Blocked requests return `429` with `Retry-After`, `X-RateLimit-Limit`, and a short actionable JSON
error.

## Web Security Headers

The dashboard sends baseline security headers from `apps/web/next.config.ts`:

- `Content-Security-Policy-Report-Only`;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy`;
- production-only `Strict-Transport-Security`.

CSP is report-only for Dev Alpha because wallet/browser-extension flows and hosted indexer URLs need
browser QA before enforcing. Keep `style-src 'unsafe-inline'` while the app uses inline styles in
global error handling.

## Metrics (Prometheus)

The indexer exposes `GET /metrics` in Prometheus text exposition format:

| Metric | Type | Meaning |
| --- | --- | --- |
| `interlock_up` | gauge | Process up (always `1` when reachable). |
| `interlock_last_synced_block` | gauge | Highest block synced. |
| `interlock_actions_indexed_total` | gauge | Total `ActionChecked` records stored. |
| `interlock_sync_errors_total` | counter | Sync failures since start. |
| `interlock_sync_duration_ms` | gauge | Duration of the last sync. |
| `interlock_syncing` | gauge | `1` while a sync is in flight. |

```bash
curl http://localhost:8787/metrics
```

Point a Prometheus scrape job at the indexer `/metrics`; alert on `interlock_sync_errors_total`
increasing or `interlock_last_synced_block` going stale.

## Structured logs

Server-side surfaces (indexer, web API routes) log one JSON line per event via the shared logger
(`createLogger` in `@interlock/shared`): `{ ts, level, name, msg, ...fields }`. Set the verbosity
with `LOG_LEVEL` (`debug` < `info` < `warn` < `error`; default `info`). The indexer logs sync
start / complete (with counts + duration) / failure; the web demo route logs each recorded step
with its `requestId` and tx hash. **Secrets are never logged.**

## CLI doctor

`interlock doctor` checks RPC reachability + chain id, contract deployment (bytecode present),
PolicyRegistry compatibility, and indexer `/health`. See [getting-started.md](./getting-started.md)
and the [indexer README](../packages/indexer/README.md) for setup.

```bash
pnpm cli doctor --no-fail
pnpm live:services        # smoke web + indexer health
```
