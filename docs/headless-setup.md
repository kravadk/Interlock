# Headless Setup Runbook

This runbook is for developers who want to use Interlock Firewall without the dashboard. It covers the terminal path from deployed contracts to a working policy and recorded firewall decision.

## 1. Configure

```bash
cp .env.example .env
```

Fill:

```bash
PRIVATE_KEY=0x...
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
AGENT_REGISTRY=0x...
POLICY_REGISTRY=0x...
ACTION_ATTESTATION=0x...
ACTION_TARGET=0x...
```

Check the environment:

```bash
pnpm env:doctor
```

`ok` is `false` until real deployed contract addresses are set. RPC reachability and chain ID should still pass.

## 2. Register An Agent

```bash
pnpm cli -- register-agent \
  --metadata-uri ipfs://interlock-demo-agent \
  --private-key 0x...
```

Save the returned `agentId`:

```bash
AGENT_ID=<real_agent_id>
```

The indexer and explorer are the source of truth after the transaction is mined.
The CLI waits for the receipt and extracts `agentId` from the `AgentRegistered` event.

## 3. Create A Policy

Fast preset path:

```bash
pnpm cli -- policy-create-preset \
  --agent-id <real_agent_id> \
  --name conservative-defi \
  --target 0xVault... \
  --max-native 0.02 \
  --max-slippage-bps 100 \
  --private-key 0x...
```

Explicit path:

```bash
pnpm cli -- policy-create \
  --agent-id <real_agent_id> \
  --target 0xVault... \
  --selector 0xd0e30db0 \
  --max-native 0.02 \
  --max-slippage-bps 100 \
  --private-key 0x...
```

Save the returned `policyId`:

```bash
POLICY_ID=<real_policy_id>
```

The CLI waits for the receipt and extracts `policyId` from the `PolicyCreated` event.

## 4. Run A Preflight Check

Before a full preflight, inspect the policy:

```bash
pnpm cli -- agent-get --agent-id <real_agent_id>
pnpm cli -- policy-get --policy-id <real_policy_id>
pnpm cli -- policy-check --policy-id <real_policy_id> --target 0xVault... --selector 0xd0e30db0
```

```bash
pnpm cli -- preflight \
  --agent-id <real_agent_id> \
  --policy-id <real_policy_id> \
  --to 0xVault... \
  --value 0 \
  --data 0xd0e30db0 \
  --intent "Deposit test funds into approved vault"
```

Expected safe result:

```json
{
  "allowed": true,
  "decision": "ALLOW",
  "reasonCode": "POLICY_PASSED"
}
```

Expected blocked result for a non-allowlisted target:

```json
{
  "allowed": false,
  "decision": "BLOCK",
  "reasonCode": "TARGET_NOT_ALLOWED"
}
```

## 5. Record The Decision

```bash
pnpm cli -- record \
  --agent-id <real_agent_id> \
  --policy-id <real_policy_id> \
  --to 0xVault... \
  --value 0 \
  --data 0xd0e30db0 \
  --intent "Deposit test funds into approved vault" \
  --private-key 0x...
```

This writes an `ActionChecked` attestation. It does not execute the proposed transaction. Your agent runtime should execute only after an `ALLOW`.
The CLI waits for the receipt and returns the emitted `actionCheckId`, `decision`, `reasonCode`, transaction hash, and block number.

## 6. Run The Indexer

```bash
pnpm indexer:env
```

Then query:

```bash
curl http://127.0.0.1:8787/health
curl "http://127.0.0.1:8787/actions?agentId=<real_agent_id>&limit=10"
curl http://127.0.0.1:8787/stats/agents/<real_agent_id>
```

## 7. Production Pattern

For a headless agent service:

```text
agent planner
  -> proposed tx
  -> pnpm cli preflight or SDK checkAction()
  -> if ALLOW: execute tx
  -> record ActionChecked
  -> indexer exposes audit trail
```

Use the SDK directly in production services. Use the CLI for runbooks, CI gates, manual policy setup, and smoke testing.
