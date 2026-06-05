# Recorder Service and API

Interlock Recorder Service is the read layer for the Flight Recorder, public status panels, Agent Safety Cards, analytics, webhook alerts, and benchmark evidence. It syncs agent registry, policy lifecycle, and action attestation events, then exposes a small HTTP API for dashboards, scripts, and external devtools.

## Why It Exists

The dashboard should not scan the chain from the browser every time. The indexer gives a stable read API:

```text
AgentRegistry / PolicyRegistry / ActionAttestation events -> Indexer store -> HTTP API -> Dashboard / external tools
```

In live mode, the sync inputs are:

```text
AgentRegistry.AgentRegistered
PolicyRegistry.PolicyCreated
PolicyRegistry.PolicyUpdated
PolicyRegistry.TargetPermissionUpdated
PolicyRegistry.SelectorPermissionUpdated
ActionAttestation.ActionChecked
```

The API sends permissive CORS headers for the MVP so the local Next.js dashboard can read it directly from `http://127.0.0.1:3000`.

## Run Locally

```bash
AGENT_REGISTRY=0x...
POLICY_REGISTRY=0x...
ACTION_ATTESTATION=0x...
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
FROM_BLOCK=0
PORT=8787
AUTO_SYNC=true
SYNC_INTERVAL_MS=60000
WEBHOOK_URL=
WEBHOOK_SECRET=
WEBHOOK_EVENTS=block,simulation_failed

pnpm --filter @interlock/indexer dev
```

Point the dashboard to the API:

```bash
NEXT_PUBLIC_INDEXER_URL=<recorder_api_url>
pnpm --filter @interlock/web dev
```

If `NEXT_PUBLIC_INDEXER_URL=disabled`, the dashboard uses a browser-side Mantle RPC fallback for real `ActionChecked` events from the current `ActionAttestation` contract. It never shows fake history. A hosted/local indexer is still recommended for faster public Flight Recorder reads and registered agent/policy metadata.

The dashboard can still register agents, create policies, and record new attestations without the indexer if the `NEXT_PUBLIC_*` contract addresses are configured. With `AUTO_SYNC=true`, the indexer pulls new registry and action events periodically. Use the dashboard `Sync indexer` button or call `POST /sync` manually when you want an immediate refresh.

Event sync is chunked by block range to reduce provider rate-limit failures. Configure `INDEXER_BLOCK_CHUNK_SIZE` if a provider needs smaller or larger ranges.

## Storage

The standalone indexer uses SQLite persistence through Node's built-in `node:sqlite` module. By default it writes a deployment-scoped database based on the `ACTION_ATTESTATION` address:

```text
.interlock-indexer-<deployment>.sqlite
```

Set a custom path:

```bash
INDEXER_DB_PATH=./data/interlock-indexer.sqlite
pnpm --filter @interlock/indexer dev
```

Use `INDEXER_DB_PATH=:memory:` only for throwaway local runs. To reset local indexed state, stop the indexer and delete the SQLite file.

Do not reuse one SQLite file across multiple contract deployments unless you deliberately want merged history. Agent and policy ids restart at `1` on every fresh deployment, so deployment-scoped storage prevents stale cross-deployment records from appearing in the dashboard.

## Sync Events

By default, standalone indexer syncs immediately on startup and then every `SYNC_INTERVAL_MS`.

Disable auto-sync:

```bash
AUTO_SYNC=false
pnpm --filter @interlock/indexer dev
```

Trigger a manual sync:

```bash
curl -X POST http://127.0.0.1:8787/sync
```

Manual sync response:

```json
{
  "synced": 3,
  "agents": 1,
  "policies": 1,
  "actions": 1
}
```

## Endpoints

Health:

```text
GET /health
GET /status
GET /network
```

Health includes sync metadata:

```json
{
  "ok": true,
  "nextFromBlock": "123456",
  "lastSyncStartedAt": "2026-05-28T19:42:00.000Z",
  "lastSyncCompletedAt": "2026-05-28T19:42:01.000Z",
  "lastSyncedCount": 2,
  "autoSync": true,
  "syncIntervalMs": 15000,
  "syncing": false,
  "storage": ".interlock-indexer-f62727d6.sqlite"
}
```

Status includes the public control-plane view:

```json
{
  "name": "interlock-recorder-service",
  "network": {
    "name": "Mantle Sepolia",
    "chainId": 5003
  },
  "contracts": {
    "agentRegistry": "0x...",
    "policyRegistry": "0x...",
    "actionAttestation": "0x..."
  },
  "records": {
    "agents": 1,
    "policies": 1,
    "actions": 3,
    "latestIndexedBlock": "123456"
  }
}
```

`GET /network` returns a compact subset: network, contracts, and record counts.

List actions:

```text
GET /actions
GET /actions?agentId=<real_agent_id>
GET /actions?policyId=1
GET /actions?decision=BLOCK
GET /actions?reasonCode=SIMULATION_FAILED
GET /actions?target=0x...
GET /actions?selector=0xd0e30db0
GET /actions?limit=25&offset=50
GET /actions/1
```

`limit` defaults to `100` and is capped at `500`. `offset` defaults to `0`. List responses keep top-level `actions` for backwards compatibility and include a `page` object for cursor-like pagination:

```json
{
  "actions": [],
  "page": {
    "total": 127,
    "limit": 25,
    "offset": 50,
    "nextOffset": 75
  }
}
```

`nextOffset` is omitted when there is no next page.

Agents:

```text
GET /agents
GET /agents/1
GET /agents/1/actions
GET /agents/1/actions?decision=BLOCK&selector=0xd0e30db0
```

Policies:

```text
GET /policies
GET /policies/1
GET /policies/1/actions
GET /policies/1/actions?reasonCode=UNKNOWN_SELECTOR
```

Agent stats:

```text
GET /stats/agents/1
```

Benchmark summary:

```text
GET /benchmark/1
```

Analytics:

```text
GET /analytics
GET /analytics/agents/1
GET /analytics/policies/1
```

Analytics are computed from indexed `ActionChecked` rows only:

```json
{
  "scope": "global",
  "totalActions": 3,
  "allowed": 1,
  "blocked": 2,
  "review": 0,
  "failedSimulations": 0,
  "blockRate": 67,
  "topReasons": [
    { "reasonCode": "TARGET_NOT_ALLOWED", "count": 1 }
  ],
  "topTargets": [],
  "topSelectors": [],
  "latestActions": []
}
```

Benchmark response:

```json
{
  "agentId": "1",
  "score": 100,
  "scoreLabel": "100% evidence score",
  "totalActions": 3,
  "allowedActions": 1,
  "blockedActions": 2,
  "failedSimulations": 0,
  "reasonBreakdown": {
    "POLICY_PASSED": 1,
    "TARGET_NOT_ALLOWED": 1,
    "VALUE_LIMIT_EXCEEDED": 1
  },
  "disclaimer": "Dev Alpha evidence summary only. This is not an audited production trust score."
}
```

## Webhook Alerts

Set `WEBHOOK_URL` to notify a backend after new indexed decisions. `WEBHOOK_EVENTS` supports `allow`, `block`, and `simulation_failed`.

Payloads are signed when `WEBHOOK_SECRET` is configured:

```text
x-interlock-signature: sha256=<hmac sha256 over raw JSON body>
```

Webhook delivery is best-effort. Failures are written to `/health` and `/status`, but sync continues.

## Response Shape

Action list response:

```json
{
  "actions": [
    {
      "actionCheckId": "1",
      "agentId": "1",
      "policyId": "1",
      "target": "0x...",
      "value": "1000000000000000",
      "decision": "ALLOW",
      "reasonCode": "POLICY_PASSED",
      "transactionHash": "0x...",
      "blockNumber": "123"
    }
  ],
  "page": {
    "total": 1,
    "limit": 100,
    "offset": 0
  }
}
```

Agent summary response. Registered agents appear even before they have actions:

```json
{
  "agents": [
    {
      "agentId": "1",
      "owner": "0x...",
      "metadataURI": "ipfs://agent",
      "registrationTxHash": "0x...",
      "registrationBlockNumber": "123",
      "totalActions": 3,
      "allowedActions": 2,
      "blockedActions": 1,
      "reviewActions": 0,
      "failedSimulations": 1,
      "policyIds": ["1", "2"],
      "latestAction": {
        "actionCheckId": "3",
        "decision": "BLOCK",
        "reasonCode": "SIMULATION_FAILED"
      }
    }
  ]
}
```

Policy summary response. Registered policies appear even before they have actions:

```json
{
  "policies": [
    {
      "policyId": "1",
      "owner": "0x...",
      "maxNativeValue": "20000000000000000",
      "maxSlippageBps": 100,
      "active": true,
      "allowedTargets": ["0x..."],
      "allowedSelectors": ["0xd0e30db0"],
      "registrationTxHash": "0x...",
      "registrationBlockNumber": "124",
      "agentIds": ["1"],
      "totalActions": 3,
      "allowedActions": 2,
      "blockedActions": 1,
      "reviewActions": 0,
      "failedSimulations": 1
    }
  ]
}
```

## Current Limitation

SQLite persistence is intended for local/dev deployments. A hosted production deployment should add Postgres, migrations, and a managed sync worker.

Optional production direction:

```bash
INDEXER_DB_URL=postgres://user:password@host:5432/interlock
```

`INDEXER_DB_URL` is reserved for a future `PostgresActionStore`. The current Dev Alpha implementation does not ship a Postgres driver yet, so hosted production deployments should either run the existing SQLite store with durable volume storage or implement the Postgres store behind the existing `ActionStoreLike` interface before relying on it for public traffic.

The current registry index tracks policy updates and permission deltas, but agent metadata itself is immutable in the MVP contracts. Future versions should add explicit agent metadata update events and historical policy snapshots per block.
