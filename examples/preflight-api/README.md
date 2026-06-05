# Preflight API Example

This example shows the backend/API integration path for Interlock Firewall.

Use it when an agent runtime posts proposed transaction JSON to your service and the service must return an allow/block response before wallet execution.

```bash
pnpm --filter @interlock/example-preflight-api demo
```

Without `AGENT_ID`/`POLICY_ID`, the example prints the live contracts it will use. With both ids, it runs a live pre-flight check through `createFirewallActionHandler`.

Run it as a local REST service:

```bash
POLICY_ID=<real_policy_id> AGENT_ID=<real_agent_id> pnpm --filter @interlock/example-preflight-api serve
```

Read-only preflight:

```bash
curl -X POST http://127.0.0.1:8790/preflight \
  -H "content-type: application/json" \
  -d '{"to":"0xE4dFef03E107225f2239CFfF955a378A9a8158Be","value":"0","data":"0x2de5aaf70000000000000000000000000000000000000000000000000000000000000008"}'
```

Agent Gateway route:

```bash
curl -X POST http://127.0.0.1:8790/gateway/action \
  -H "content-type: application/json" \
  -d '{"mode":"dry-run","to":"0xE4dFef03E107225f2239CFfF955a378A9a8158Be","value":"0","data":"0x2de5aaf70000000000000000000000000000000000000000000000000000000000000008","intent":"Check before agent execution"}'
```

Bundle preflight:

```bash
curl -X POST http://127.0.0.1:8790/preflight/bundle \
  -H "content-type: application/json" \
  -d '{"intent":"Review a multi-step agent route","routeProvider":"manual","actions":[{"to":"0xE4dFef03E107225f2239CFfF955a378A9a8158Be","value":"0","data":"0x2de5aaf70000000000000000000000000000000000000000000000000000000000000008","intent":"Read agent profile"}]}'
```

Write mode for recording decisions:

```bash
PRIVATE_KEY=0x... POLICY_ID=<real_policy_id> AGENT_ID=<real_agent_id> pnpm --filter @interlock/example-preflight-api serve
```

Routes:

- `GET /health`
- `POST /preflight`
- `POST /preflight/bundle`
- `POST /record`
- `POST /gateway/action`
- `GET /agents/:id/actions`
- `GET /policies/:id`

Schemas:

- `../../schemas/rest-preflight-request.schema.json`
- `../../schemas/rest-record-request.schema.json`
- `../../schemas/rest-preflight-response.schema.json`

The request must include full calldata. Passing only a selector for a function that requires arguments will be rejected or blocked by pre-flight checks.

`/gateway/action` supports `mode: "dry-run" | "record-only" | "execute-if-allowed" | "block-and-alert"`. Only `dry-run` is read-only. Write/send modes require `PRIVATE_KEY` in the API process.
