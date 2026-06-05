# CLI

`@interlock/cli` is a developer tool for running Interlock Control Plane checks from a terminal, CI job, or agent runtime script.

Run it from the monorepo:

```bash
pnpm cli -- help
```

This command builds `@interlock/shared`, `@interlock/firewall-sdk`, `@interlock/indexer`, and `@interlock/cli` first, then runs the compiled CLI from `packages/cli/dist`. That catches packaging and ESM export issues before another developer hits them.

When you are actively editing CLI source and want a faster loop, use:

```bash
pnpm cli:dev -- help
```

## Environment

The CLI reads the same environment variables as the SDK examples:

```bash
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
PRIVATE_KEY=0x...
AGENT_REGISTRY=0x...
POLICY_REGISTRY=0x...
ACTION_ATTESTATION=0x...
```

You can also pass these as flags:

```bash
--rpc-url
--private-key
--agent-registry
--policy-registry
--action-attestation
```

## Doctor

Check RPC connectivity, Mantle chain ID, contract bytecode, private key presence, and optional indexer health:

```bash
pnpm cli -- doctor --indexer-url <recorder_api_url>
```

`doctor` exits with code `1` when the environment is not ready. For local diagnosis where you only want the JSON report:

```bash
pnpm cli -- doctor --no-fail
```

## Init, Status, Whoami

Create a local env file without overwriting an existing file:

```bash
pnpm cli -- init --out .env.interlock.local
```

Inspect the current control-plane setup:

```bash
pnpm cli -- status --agent-id <real_agent_id> --policy-id <real_policy_id> --indexer-url <recorder_api_url>
pnpm cli -- whoami
```

`status` combines the doctor report with selected agent/policy reads. `whoami` is read-only and shows whether writes are available from `PRIVATE_KEY`.

## Quickstart

Run a write-mode zero-to-flow setup:

```bash
pnpm cli -- quickstart --private-key 0x...
pnpm cli -- quickstart --record --private-key 0x...
```

This registers an agent, creates a basic AgentRegistry policy, runs a safe pre-flight, runs a blocked unknown-target pre-flight, and optionally records both decisions on Mantle Sepolia.

## Benchmark

Run the repeatable safety benchmark against an existing agent and policy:

```bash
pnpm cli -- benchmark run --agent-id <real_agent_id> --policy-id <real_policy_id>
pnpm cli -- benchmark run --agent-id <real_agent_id> --policy-id <real_policy_id> --record --private-key 0x...
```

The default suite checks:

- safe AgentRegistry read;
- unknown target attempt;
- overspend attempt;
- high slippage attempt;
- unapproved `approve(address,uint256)` selector;
- selector-only calldata that should fail simulation;
- empty calldata on an otherwise allowlisted target.

The output is JSON suitable for a demo video, CI log, or public Agent Safety Card. It includes `version: "v2"`, scenario coverage, expected vs actual decision matching, and remediation for failed scenarios.

## Analytics

Read Recorder-derived metrics:

```bash
pnpm cli -- analytics --indexer-url <recorder_api_url>
pnpm cli -- analytics --agent-id <real_agent_id>
pnpm cli -- analytics --policy-id <real_policy_id>
```

Analytics are read from the Recorder Service only. The CLI does not invent metrics from local defaults.

## Webhook Test

Send a signed webhook payload based on the latest real indexed ActionChecked record:

```bash
pnpm cli -- webhook-test \
  --url <webhook_receiver_url> \
  --indexer-url <recorder_api_url> \
  --secret dev-secret
```

If `--url` is omitted, the CLI reads `WEBHOOK_URL`. If `--secret` is omitted, it reads `WEBHOOK_SECRET`.

## Register Agent

Create a new agent from the terminal:

```bash
pnpm cli -- register-agent \
  --metadata-uri ipfs://interlock-demo-agent \
  --private-key 0x...
```

Output:

```json
{
  "agentId": "1",
  "transactionHash": "0x..."
}
```

The CLI waits for the transaction receipt and returns the `agentId` from the emitted `AgentRegistered` event.

## Create Policy

Create a policy from explicit targets and function selectors:

```bash
pnpm cli -- policy-create \
  --agent-id <real_agent_id> \
  --target 0xVault... \
  --selector 0xd0e30db0 \
  --max-native 0.02 \
  --max-slippage-bps 100 \
  --private-key 0x...
```

Create a policy from a preset:

```bash
pnpm cli -- policy-create-preset \
  --agent-id <real_agent_id> \
  --name conservative-defi \
  --target 0xVault... \
  --max-native 0.02 \
  --max-slippage-bps 100 \
  --private-key 0x...
```

Output:

```json
{
  "policyId": "1",
  "transactionHash": "0x..."
}
```

Use `policy-create` when you already know exact target contracts and selectors. Use `policy-create-preset` for a safer first setup with predefined selector packs.
Both commands wait for the transaction receipt and return `policyId` from the emitted `PolicyCreated` event.

## Policy Packs

A policy pack is a JSON policy artifact that can live in your repository, be reviewed in PRs, and be imported into `PolicyRegistry` during environment setup.

The repo includes [policy-pack.schema.json](../schemas/policy-pack.schema.json) and [conservative-defi.example.json](../policies/conservative-defi.example.json) for IDE/CI validation.

Create a pack from a preset:

```bash
pnpm build:packages
node packages/cli/dist/index.js policy-pack \
  --name conservative-defi \
  --target 0xVault... \
  --target 0xRouter... \
  --max-native 0.02 \
  --max-slippage-bps 100 \
  > policies/conservative-defi.json
```

Use the direct `node packages/cli/dist/index.js` command when redirecting JSON to a file. The monorepo helper `pnpm cli -- ...` intentionally builds first and can print build logs to stdout.

List Mantle ecosystem pack templates:

```bash
pnpm cli -- policy-pack --list
pnpm cli -- policy-pack-registry
```

These templates include Mantle Basic Agent, Mantle DeFi Trading Guard, AI Alpha Execution Guard, RWA Yield Guard, Byreal / RealClaw Adapter Pack, Agent Wallet Spending Constitution, and Consumer Safe Mode. Template packs do not contain fake protocol addresses; the integrating team must supply real approved addresses before creating a policy.

Validate it locally without touching chain:

```bash
pnpm cli -- policy-pack-validate --file policies/conservative-defi.json
```

Import it on-chain for an existing agent:

```bash
pnpm cli -- policy-import \
  --agent-id <real_agent_id> \
  --file policies/conservative-defi.json \
  --private-key 0x...
```

Dry-run import to see the exact `createPolicy` input:

```bash
pnpm cli -- policy-import \
  --agent-id <real_agent_id> \
  --file policies/conservative-defi.json \
  --dry-run
```

## Policy Versioning

Policy versions are off-chain JSON artifacts for review, diff, and verification. They do not change smart contracts.

Snapshot an on-chain policy:

```bash
pnpm cli -- policy-version snapshot --policy-id <real_policy_id> --out policies/policy-1.v1.json
```

Diff two snapshots:

```bash
pnpm cli -- policy-version diff \
  --from policies/policy-1.v1.json \
  --to policies/policy-1.v2.json
```

Verify a snapshot against the current on-chain policy:

```bash
pnpm cli -- policy-version verify --file policies/policy-1.v1.json
```

Audit an already-created on-chain policy against the pack:

```bash
pnpm cli -- policy-audit \
  --policy-id <real_policy_id> \
  --agent-id <real_agent_id> \
  --file policies/conservative-defi.json
```

`policy-audit` exits with code `1` when drift is found. Use `--no-fail` when you only want the JSON report. The audit checks max native value, max slippage, expected active state, optional agent id, every target in the pack, and every selector in the pack.

Exact audit requires `PolicyRegistry` v1.1.0+ with enumerable allowlists. On older deployments, use `--legacy-partial` only as a temporary compatibility mode; it can verify pack targets/selectors individually but cannot detect extra on-chain allowlist entries.

Apply pack rules to an existing policy:

```bash
pnpm cli -- policy-apply \
  --policy-id <real_policy_id> \
  --agent-id <real_agent_id> \
  --file policies/conservative-defi.json \
  --private-key 0x...
```

Preview the exact operations first:

```bash
pnpm cli -- policy-apply \
  --policy-id <real_policy_id> \
  --agent-id <real_agent_id> \
  --file policies/conservative-defi.json \
  --dry-run \
  --no-fail
```

Use exact reconciliation when the pack should be the source of truth:

```bash
pnpm cli -- policy-apply \
  --policy-id <real_policy_id> \
  --agent-id <real_agent_id> \
  --file policies/conservative-defi.json \
  --prune \
  --private-key 0x...
```

`policy-apply` can update policy limits and active state, allow missing targets/selectors from the pack, and with `--prune` revoke extra on-chain targets/selectors that are not present in the pack. Run `--dry-run --prune` first in CI or deployment scripts to preview all operations.

Policy pack shape:

```json
{
  "version": "interlock.policy.v1",
  "name": "Conservative DeFi Agent",
  "chainId": 5003,
  "maxNativeValue": "20000000000000000",
  "maxSlippageBps": 100,
  "targets": [{ "address": "0xe4dfef03e107225f2239cfff955a378a9a8158be" }],
  "selectors": [{ "selector": "0xd0e30db0", "label": "demo vault deposit" }]
}
```

## Preflight

Run a policy check without sending the transaction:

```bash
pnpm cli -- preflight \
  --agent-id <real_agent_id> \
  --policy-id <real_policy_id> \
  --to 0xVault... \
  --value 0.01 \
  --data 0xd0e30db0 \
  --intent "Deposit into approved vault"
```

Output is JSON-safe and can be consumed by scripts:

```json
{
  "allowed": true,
  "decision": "ALLOW",
  "reasonCode": "POLICY_PASSED",
  "riskScore": 8
}
```

## Gateway

Run the same agent gateway that SDK, REST, and MCP integrations use:

```bash
pnpm cli -- gateway run \
  --mode dry-run \
  --agent-id <real_agent_id> \
  --policy-id <real_policy_id> \
  --to 0xVault... \
  --value 0 \
  --data 0x \
  --intent "Check before agent execution"
```

Modes:

- `dry-run`: read-only policy + simulation check.
- `record-only`: record the pre-flight decision without sending.
- `execute-if-allowed`: send only if allowed, then record according to `--record-timing`.
- `block-and-alert`: return an alert payload for blocked actions.

Write/send modes require `--private-key` or `PRIVATE_KEY`:

```bash
pnpm cli -- gateway run \
  --mode execute-if-allowed \
  --agent-id <real_agent_id> \
  --policy-id <real_policy_id> \
  --to 0xVault... \
  --data 0x \
  --private-key 0x...
```

The gateway result is JSON-safe and includes `status`, `sent`, `recorded`, `decision`, optional transaction hashes, optional alert payload, and `nextAction`.

## Record

Run a preflight check and write the allow/block decision to `ActionAttestation`:

```bash
pnpm cli -- record \
  --agent-id <real_agent_id> \
  --policy-id <real_policy_id> \
  --to 0xVault... \
  --value 0.01 \
  --data 0xd0e30db0 \
  --private-key 0x...
```

This does not execute the proposed transaction. It only records the firewall decision.
The CLI waits for the transaction receipt and returns the emitted `ActionChecked` data under `attestation`.

## History

Read recorded `ActionChecked` events:

```bash
pnpm cli -- history --agent-id <real_agent_id> --from-block 0
```

Optional filters:

```bash
--agent-id
--policy-id
--from-block
--to-block
```

## Inspect Agent And Policy

Read agent reputation counters:

```bash
pnpm cli -- agent-get --agent-id <real_agent_id>
```

Read policy owner, limits, and active state:

```bash
pnpm cli -- policy-get --policy-id <real_policy_id>
```

Check allowlists without running a full transaction preflight:

```bash
pnpm cli -- policy-check \
  --policy-id <real_policy_id> \
  --target 0xVault... \
  --selector 0xd0e30db0
```

Use `policy-check` when debugging why a proposed action is blocked before spending time on simulation details.

## Preset

Print a policy preset summary before creating it from the SDK or dashboard:

```bash
pnpm cli -- preset \
  --name conservative-defi \
  --target 0xVault... \
  --target 0xRouter... \
  --max-native 0.02 \
  --max-slippage-bps 100
```

Preset names:

- `conservative-defi`
- `payments`
- `rwa-read-only`
- `approvals`

## Policy Management

Update policy limits and active status:

```bash
pnpm cli -- policy-update \
  --policy-id <real_policy_id> \
  --max-native 0.05 \
  --max-slippage-bps 100 \
  --active true \
  --private-key 0x...
```

Allow or remove a target contract:

```bash
pnpm cli -- target-allow \
  --policy-id <real_policy_id> \
  --target 0xVault... \
  --allowed true \
  --private-key 0x...

pnpm cli -- target-allow \
  --policy-id <real_policy_id> \
  --target 0xOldVault... \
  --deny \
  --private-key 0x...
```

Allow or remove a function selector:

```bash
pnpm cli -- selector-allow \
  --policy-id <real_policy_id> \
  --selector 0xd0e30db0 \
  --allowed true \
  --private-key 0x...
```

These commands are useful for CI, deployment scripts, and production runbooks where policy changes should be explicit and auditable.

## CI Usage

A simple CI gate can run `preflight` and fail if the result is blocked:

```bash
RESULT=$(pnpm cli -- preflight --agent-id <real_agent_id> --policy-id <real_policy_id> --to 0x... --data 0x...)
echo "$RESULT" | jq -e '.allowed == true'
```

Use this for scripted agent actions, deployment bots, and scheduled strategies where you want policy enforcement before execution.
