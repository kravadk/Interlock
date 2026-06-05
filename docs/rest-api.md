# REST Preflight API

The REST path is for backend agent runtimes that submit proposed transaction JSON to a service before wallet execution.

The reference implementation lives in `examples/preflight-api`.

Schemas:

- `schemas/rest-preflight-request.schema.json`
- `schemas/rest-record-request.schema.json`
- `schemas/rest-preflight-response.schema.json`

## Run

```bash
POLICY_ID=<real_policy_id> AGENT_ID=<real_agent_id> pnpm --filter @interlock/example-preflight-api serve
```

Optional write mode:

```bash
PRIVATE_KEY=0x... POLICY_ID=<real_policy_id> AGENT_ID=<real_agent_id> pnpm --filter @interlock/example-preflight-api serve
```

Without `PRIVATE_KEY`, `/preflight` and `/gateway/action` with `mode: "dry-run"` work in read-only mode. `/record` and write/send gateway modes return an actionable wallet configuration error.

## `GET /health`

Returns chain, agent, policy, and write-mode status.

```json
{
  "ok": true,
  "chainId": 5003,
  "agentId": "8",
  "policyId": "7",
  "recordEnabled": false,
  "action": "POST /gateway/action with a proposed transaction JSON body."
}
```

## `POST /preflight`

Runs a live policy check and Mantle Sepolia RPC simulation. It does not write on-chain.

Request rules:

- `to` must be an EVM address.
- `value` must be a non-negative integer string in wei. It defaults to `0`.
- `data` must be full 0x-prefixed calldata with complete bytes. Do not pass only a selector when the function needs arguments.
- Empty calldata is `0x`; odd-length hex like `0x0` is rejected before RPC simulation.
- `expectedSlippageBps` must be an integer in `0..10000`.
- `expectedSlippageBps` must be an integer from `0` to `10000`.

Request:

```json
{
  "to": "0xE4dFef03E107225f2239CFfF955a378A9a8158Be",
  "value": "0",
  "data": "0x2de5aaf70000000000000000000000000000000000000000000000000000000000000008",
  "intent": "Read agent state before execution.",
  "expectedSlippageBps": 0
}
```

Response:

```json
{
  "ok": true,
  "status": "allowed",
  "decision": {
    "allowed": true,
    "decision": "ALLOW",
    "reasonCode": "POLICY_PASSED"
  }
}
```

## `POST /record`

Runs the same preflight and records the decision through `ActionAttestation`. This route requires a write-capable SDK config, normally `PRIVATE_KEY` in the reference server.

Blocked actions can still be recorded as evidence that the firewall stopped a risky action. Allowed actions are rejected by the contract if the current on-chain policy no longer permits the target, selector, or native value.

The request body follows `schemas/rest-record-request.schema.json`, which intentionally matches the preflight request schema.

## `POST /gateway/action`

Runs the SDK Agent Gateway for a proposed transaction. This is the recommended REST route for backend agent runtimes because it exposes one stable flow for read-only checks, recording, guarded execution, and alert payloads.

Additional body fields:

- `mode`: `dry-run`, `record-only`, `execute-if-allowed`, or `block-and-alert`. Defaults to `dry-run`.
- `recordDecision`: optional boolean. Useful for `block-and-alert` when the server should also write evidence.
- `recordTiming`: `before-send` or `after-send`. Used by `execute-if-allowed`.

Read-only request:

```json
{
  "mode": "dry-run",
  "to": "0xE4dFef03E107225f2239CFfF955a378A9a8158Be",
  "value": "0",
  "data": "0x2de5aaf70000000000000000000000000000000000000000000000000000000000000008",
  "intent": "Read agent state before execution."
}
```

Response:

```json
{
  "ok": true,
  "status": "allowed",
  "gateway": {
    "mode": "dry-run",
    "status": "allowed",
    "sent": false,
    "recorded": false,
    "nextAction": "Safe to execute this action through the configured agent wallet if the caller still intends to proceed."
  }
}
```

Write/send modes require `PRIVATE_KEY` in the reference server environment. Attestations are pre-flight decision evidence, not proof that the downstream transaction executed.

## `GET /agents/:id/actions`

Proxies the configured indexer endpoint for per-agent history.

## `GET /policies/:id`

Proxies the configured indexer endpoint for policy detail.

## Error Shape

Errors are structured and actionable:

```json
{
  "ok": false,
  "status": "error",
  "code": "POLICY_ID_REQUIRED",
  "message": "POLICY_ID is required for the preflight API.",
  "action": "Set POLICY_ID to a live policy id that belongs to the configured AGENT_ID."
}
```
