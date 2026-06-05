# Webhooks

Interlock Recorder Service can deliver signed webhook alerts after newly indexed `ActionChecked` events.

Use case:

```text
agent proposes risky tx -> Interlock blocks -> decision is recorded -> Recorder syncs -> webhook alerts developer/security service
```

## Environment

```bash
WEBHOOK_URL=https://example.com/interlock-webhook
WEBHOOK_SECRET=replace-with-shared-secret
WEBHOOK_EVENTS=block,simulation_failed
```

Supported `WEBHOOK_EVENTS` values:

- `allow`
- `block`
- `simulation_failed`

Default: `block,simulation_failed`.

## Headers

```text
x-interlock-event: action.blocked | action.allowed | action.simulation_failed
x-interlock-delivery: delivery id
x-interlock-signature: sha256=<hmac sha256 over raw JSON body>
```

`x-interlock-signature` is present only when `WEBHOOK_SECRET` is configured.

## Payload

```json
{
  "event": "action.blocked",
  "agentId": "<real_agent_id>",
  "policyId": "<real_policy_id>",
  "decision": "BLOCK",
  "reasonCode": "TARGET_NOT_ALLOWED",
  "target": "<real_non_allowlisted_target>",
  "selector": "0x2de5aaf7",
  "value": "0",
  "transactionHash": "<real_action_checked_tx_hash>",
  "blockNumber": "<real_block_number>",
  "explorerUrl": "https://sepolia.mantlescan.xyz/tx/0x..."
}
```

## Receiver Example

```ts
import { createHmac } from "node:crypto";
import express from "express";

const app = express();
app.use(express.raw({ type: "application/json" }));

app.post("/interlock-webhook", (req, res) => {
  const body = req.body.toString("utf8");
  const expected =
    "sha256=" +
    createHmac("sha256", process.env.WEBHOOK_SECRET!)
      .update(body)
      .digest("hex");

  if (req.header("x-interlock-signature") !== expected) {
    return res.status(401).send("invalid signature");
  }

  const payload = JSON.parse(body);
  console.log(req.header("x-interlock-event"), payload.decision, payload.reasonCode);
  res.sendStatus(204);
});
```

## CLI Test

```bash
pnpm cli -- webhook-test \
  --url <webhook_receiver_url> \
  --indexer-url <recorder_api_url> \
  --secret <shared_secret>
```

Without `--payload`, the CLI uses the latest real indexed `ActionChecked` record from the configured Recorder API.

## Failure Model

- Delivery retries 3 times with short backoff.
- A webhook failure does not fail Recorder sync.
- Last delivery status is visible in `GET /health` and `GET /status`.
- Webhooks are integration alerts, not a replacement for on-chain evidence.
