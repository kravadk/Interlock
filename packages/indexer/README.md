# Interlock Recorder Service

Lightweight HTTP recorder/indexer for Interlock Control Plane registry, policy, action, and benchmark records.

The standalone server persists data to SQLite and syncs `AgentRegistered`, `PolicyCreated`, and `ActionChecked` events. It is intended as the public read API boundary for dashboard status, Flight Recorder, Agent Safety Cards, analytics, webhook alerts, and benchmark summaries.

## Run

```bash
AGENT_REGISTRY=0x...
POLICY_REGISTRY=0x...
ACTION_ATTESTATION=0x...
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
FROM_BLOCK=0
PORT=8787
AUTO_SYNC=true
SYNC_INTERVAL_MS=60000
INDEXER_BLOCK_CHUNK_SIZE=9000
WEBHOOK_URL=
WEBHOOK_SECRET=
WEBHOOK_EVENTS=block,simulation_failed

pnpm --filter @interlock/indexer dev
```

For the web dashboard, set:

```bash
NEXT_PUBLIC_INDEXER_URL=<recorder_api_url>
```

The server includes CORS headers so `apps/web` can call it from the browser during local development. When `INDEXER_DB_PATH` is omitted, the server writes to `.interlock-indexer-<deployment>.sqlite` using the `ACTION_ATTESTATION` address so fresh deployments do not mix records with older contract ids.

## Endpoints

```text
GET /snapshot
GET /snapshot?agentId=<real_agent_id>
GET /health
GET /status
GET /network
GET /agents
GET /agents/:id
GET /actions
GET /actions/:id
GET /actions?agentId=<real_agent_id>
GET /actions?policyId=1
GET /actions?decision=BLOCK
GET /actions?reasonCode=SIMULATION_FAILED
GET /actions?target=0x...
GET /actions?selector=0xd0e30db0
GET /actions?limit=25&offset=50
GET /agents/:id/actions
GET /agents/:id/actions?decision=BLOCK&selector=0xd0e30db0
GET /policies
GET /policies/:id
GET /policies/:id/actions
GET /policies/:id/actions?reasonCode=UNKNOWN_SELECTOR
GET /stats/agents/:id
GET /benchmark/:agentId
GET /analytics
GET /analytics/agents/:id
GET /analytics/policies/:id
POST /sync
```

Action list endpoints return a backwards-compatible `actions` array plus pagination metadata:

```json
{
  "actions": [],
  "page": {
    "total": 0,
    "limit": 100,
    "offset": 0
  }
}
```

## Deploy (Docker)

Build from the **monorepo root** (the indexer depends on `@interlock/shared`):

```bash
docker build -f packages/indexer/Dockerfile -t interlock-indexer .
docker run -p 8787:8787 \
  -e MANTLE_RPC_URL=https://your-rpc \
  -v interlock-db:/data \
  interlock-indexer
```

The image builds `shared` + `indexer` to `dist/` and runs `node dist/server.js` (also exposed
as `pnpm --filter @interlock/indexer start`). It persists SQLite to `/data` - mount a volume so
the index survives restarts. Any Node 22+ host works (Railway, Fly, Render, a VM): set the env
in the table above, expose the port, then point the web app's `NEXT_PUBLIC_INDEXER_URL` at the
public URL. The dashboard shows a green **Indexer** badge when connected, amber **RPC** when
falling back.

## Webhooks

Set `WEBHOOK_URL` to deliver signed alerts after newly indexed `ActionChecked` records. Delivery is best-effort and does not fail sync.

```bash
WEBHOOK_URL=https://example.com/interlock-webhook
WEBHOOK_SECRET=replace-with-shared-secret
WEBHOOK_EVENTS=block,simulation_failed
```

Headers:

```text
x-interlock-event: action.blocked | action.allowed | action.simulation_failed
x-interlock-delivery: delivery id
x-interlock-signature: sha256=<hmac sha256 over raw JSON body>
```

Supported `WEBHOOK_EVENTS` values are `allow`, `block`, and `simulation_failed`.

## Notes

- `POST /sync` manually pulls registry and action events.
- Auto-sync runs on startup and then every `SYNC_INTERVAL_MS` unless `AUTO_SYNC=false`.
- `GET /health` returns sync timing, interval, storage, and error state.
- `GET /status` returns the full Recorder Service status: network, contracts, sync state, latest indexed block, latest action, and record counts.
- `GET /network` returns a compact public subset for dashboards and hosted status panels.
- `GET /analytics` returns allowed/blocked/review/failure counts, top reason codes, targets, selectors, and latest evidence rows.
- Event reads are chunked by `INDEXER_BLOCK_CHUNK_SIZE` to reduce RPC rate-limit failures.
- Webhook failures are captured in `GET /health` and `GET /status` but do not stop event indexing.
- This package does not write to chain.
- The standalone server uses Node's built-in `node:sqlite`; current Node versions may print an experimental warning.
- Use `INDEXER_DB_PATH=:memory:` for temporary non-persistent runs.
- `INDEXER_DB_URL` is reserved for a future Postgres store. The current Dev Alpha server ships SQLite only.
- `agents` and `policies` combine registry creation events with action stats.
