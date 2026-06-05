# Deployment Guide

This guide turns the local MVP into a Mantle Sepolia live alpha.

## 1. Prerequisites

- Node.js 22+.
- pnpm 10+.
- A test wallet private key.
- Mantle Sepolia MNT for gas.
- RPC URL: `https://rpc.sepolia.mantle.xyz`.

Create `.env` from the example:

```bash
cp .env.example .env
```

Fill:

```bash
PRIVATE_KEY=0x...
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
```

Root deployment scripts load `.env` automatically through `scripts/env-run.mjs`, so you do not need to export every variable manually in your shell.

Before deploying, run the preflight guard:

```bash
pnpm deploy:preflight
```

It checks `.env`, validates that `PRIVATE_KEY` is present without printing it, confirms the RPC chain ID is Mantle Sepolia `5003`, and checks the deployer balance. Use this before spending gas on `pnpm deploy:mantle-sepolia`.

## 2. Compile and Test

```bash
pnpm install
pnpm compile:contracts
pnpm test
pnpm --filter @interlock/contracts local:smoke
```

## 3. Deploy Contracts

Redeploy the core contracts after any `PolicyRegistry` ABI/storage change. The current `policy-audit` and `policy-apply --prune` flows require `getAllowedTargets(policyId)` and `getAllowedSelectors(policyId)`, so older deployments that only expose mapping lookups are not compatible with exact policy reconciliation.

```bash
pnpm deploy:preflight
pnpm deploy:mantle-sepolia
```

Run a live smoke after deployment:

```bash
pnpm live:smoke
```

The live smoke checks bytecode, registers a temporary agent, creates a strict policy, records one `ALLOW` and one `BLOCK`, and prints the resulting reputation counters.
It also checks that `PolicyRegistry.VERSION()` is `1.2.0`, `supportsPolicyEnumeration()` returns `true`, and the created policy exposes its target/selector through `getAllowedTargets` and `getAllowedSelectors`.

The deployment script deploys:

- `AgentRegistry`
- `PolicyRegistry`
- `ActionAttestation`

Optional test strategy contracts can be deployed for the Mantle policy-pack demo:

```bash
DEPLOY_TEST_STRATEGY_CONTRACTS=true pnpm deploy:mantle-sepolia
```

This additionally deploys:

- `TestStrategyVault`
- `TestStrategyRouter`

Use these only as Interlock test contracts. They prove a real preflight-to-execution flow on Mantle Sepolia, but they are not production DeFi, RWA, or yield protocol integrations.

It also calls:

```text
AgentRegistry.setActionAttestation(actionAttestation)
```

And updates:

```text
packages/shared/src/addresses.ts
```

It also writes deployment outputs:

```text
deployments/mantle-sepolia/latest.json
deployments/mantle-sepolia/latest.env
```

`latest.json` includes a `compatibility.policyRegistry` block with the deployed registry version and enumeration support flag. Keep this in the submission artifacts so reviewers can see the deployed contracts support exact policy reconciliation.

Validate the manifest before sharing or using it in CI:

```bash
pnpm deployment:manifest:doctor
```

Validate the manifest doctor itself with the included fixture:

```bash
pnpm deployment:manifest:test
```

For an explicit file path:

```bash
node scripts/deployment-manifest-doctor.mjs --manifest deployments/mantle-sepolia/latest.json
```

The manifest doctor checks Mantle Sepolia chain metadata, deployed addresses, transaction hashes, block numbers, and `PolicyRegistry` compatibility:

```json
{
  "version": "1.2.0",
  "supportsPolicyEnumeration": true
}
```

Use the generated env file without copying variables:

```bash
pnpm deployment:doctor
pnpm with-env --env-file deployments/mantle-sepolia/latest.env pnpm cli policy-get --policy-id <real_policy_id>
pnpm indexer:live
```

If `latest.env` is missing or you want to regenerate environment variables from the manifest, run:

```bash
pnpm deployment:manifest:env -- --manifest deployments/mantle-sepolia/latest.json --out deployments/mantle-sepolia/latest.env
```

Without `--out`, the command prints the env file content to stdout. This is useful for Vercel, shell exports, or CI steps that treat `latest.json` as the single source of truth.

Before spending gas on live smoke or starting the dashboard/indexer, run the live alpha readiness check:

```bash
pnpm live:readiness
```

It validates the deployment manifest, regenerates `latest.env`, runs CLI doctor against deployed addresses, and prints the exact next commands for `live:smoke`, `live:demo`, and `live:services`.

For a stricter read-only on-chain verification before writing live smoke transactions, run:

```bash
pnpm live:verify
```

This checks Mantle Sepolia chain ID, bytecode at every manifest address, deployment receipts, `PolicyRegistry.VERSION()`, `supportsPolicyEnumeration()`, and registry links between `AgentRegistry`, `PolicyRegistry`, and `ActionAttestation`. It does not require `PRIVATE_KEY` and does not spend gas.

Generate a submission-ready deployment report:

```bash
pnpm deployment:report -- --manifest deployments/mantle-sepolia/latest.json --out deployments/mantle-sepolia/summary.md
```

The report includes contract addresses, Mantlescan links, deployment transactions, compatibility flags, and post-deploy commands.

## 4. Create Agent and Policy

Use the SDK, CLI, or dashboard flow.

CLI setup:

```bash
pnpm cli -- register-agent --metadata-uri ipfs://interlock-demo-agent --private-key 0x...
pnpm cli -- policy-create-preset --agent-id <real_agent_id> --name conservative-defi --target 0xVault... --max-native 0.02 --max-slippage-bps 100 --private-key 0x...
```

Minimum SDK setup:

```ts
const agentTx = await firewall.registerAgent({
  metadataURI: "ipfs://interlock-demo-agent",
});

const policyTx = await firewall.createPolicy({
  agentId: 1n,
  maxNativeValue: parseEther("0.02"),
  maxSlippageBps: 100,
  targets: [agentRegistry],
  selectors: [toFunctionSelector("deposit()")],
});
```

For the current alpha, read the created `agentId` and `policyId` from emitted events or use the first deployment assumptions:

```text
AGENT_ID=<real_agent_id>
POLICY_ID=<real_policy_id>
```

## 5. Run Live Raw Viem Example

```bash
PRIVATE_KEY=0x...
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
AGENT_ID=<real_agent_id>
POLICY_ID=<real_policy_id>
AGENT_REGISTRY=0x...
POLICY_REGISTRY=0x...
ACTION_ATTESTATION=0x...

pnpm --filter @interlock/example-raw-viem demo -- --live
```

Expected result:

- one transaction to `AgentRegistry.getAgent`;
- one transaction to `ActionAttestation.recordAction`;
- decision: `ALLOW`;
- reason code: `POLICY_PASSED`.

## 6. Run Dashboard

```bash
NEXT_PUBLIC_MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
NEXT_PUBLIC_AGENT_REGISTRY=0x...
NEXT_PUBLIC_POLICY_REGISTRY=0x...
NEXT_PUBLIC_ACTION_ATTESTATION=0x...
NEXT_PUBLIC_INDEXER_URL=<recorder_api_url>
NEXT_PUBLIC_DEFAULT_AGENT_ID=<real_agent_id>
NEXT_PUBLIC_DEFAULT_POLICY_ID=<real_policy_id>
NEXT_PUBLIC_DEFAULT_ACTION_TARGET=0x...
NEXT_PUBLIC_DEFAULT_SELECTOR=0x2de5aaf7
# Use only for frontend-only public hosting without a hosted indexer:
# NEXT_PUBLIC_INDEXER_URL=disabled

pnpm dev
```

Open:

```text
http://127.0.0.1:3000
```

The dashboard supports two modes:

- Read-only mode: works without wallet writes and displays only indexer/RPC data that is available.
- Public read-only fallback: if the hosted indexer is unavailable, users can manually enter a real agent id and policy id, then run a live preflight through Mantle Sepolia RPC without fake history or placeholder transactions.
- Live setup/write mode: enabled when `NEXT_PUBLIC_AGENT_REGISTRY`, `NEXT_PUBLIC_POLICY_REGISTRY`, and `NEXT_PUBLIC_ACTION_ATTESTATION` are set. The browser uses the injected wallet, switches to Mantle Sepolia, registers an agent, creates a policy, and calls `ActionAttestation.recordAction`.

Dashboard setup flow:

```text
Connect wallet
  -> Register agent
  -> Create policy for AgentRegistry.getAgent
  -> Run safe/risky action scenario
  -> Run live preflight
  -> Record attestation
  -> Sync indexer
  -> View Flight Recorder
```

Live preflight reads `PolicyRegistry`, checks target and selector allowlists, checks value/slippage limits, and runs an `eth_call` simulation through `NEXT_PUBLIC_MANTLE_RPC_URL`.

For live action history, run the indexer next to the dashboard:

```bash
AGENT_REGISTRY=0x...
POLICY_REGISTRY=0x...
ACTION_ATTESTATION=0x...
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
FROM_BLOCK=0
PORT=8787
AUTO_SYNC=true

pnpm indexer:env
```

Or with the deployment env generated by the deploy script:

```bash
pnpm indexer:live
pnpm web:live
```

Or start both services together:

```bash
pnpm live:demo
```

When the indexer is connected, the dashboard populates indexed agent and policy selectors from `/agents` and `/policies`. New registrations may take one sync interval to appear unless you click `Sync indexer` in the Flight Recorder toolbar or call `POST /sync` manually.

When the indexer is not connected, the dashboard must not invent agent history, policy rows, balances, or transactions. The manual id fields keep the Action Review and Developer Integration tabs useful by reading the selected policy directly from `PolicyRegistry` and running a real RPC simulation.

Verify the live dashboard and indexer together:

```bash
pnpm live:services
```

## 7. Explorer

Mantle Sepolia Explorer:

```text
https://sepolia.mantlescan.xyz
```

Check:

- deployed contract addresses;
- `ActionChecked` transaction;
- `AgentRegistry.getAgent` transaction;
- account gas usage.

## 8. Live Alpha Definition of Done

Live alpha is complete when:

- contracts are deployed to Mantle Sepolia;
- `packages/shared/src/addresses.ts` has real addresses;
- `deployments/mantle-sepolia/summary.md` has explorer links for contracts and deployment transactions;
- dashboard can register an agent;
- dashboard can create a policy for that agent;
- dashboard can select indexed agents and policies from the indexer;
- raw Viem live example records an `ALLOW`;
- one risky action records a `BLOCK`;
- dashboard can record an attestation from the connected wallet;
- dashboard shows indexed `ActionChecked` records through the indexer;
- README links to deployed contracts.

## 9. Current Limitations

- Contract verification is manual until explorer API scripting is added.
- `agentId` / `policyId` should be read from events; the alpha may use `1` for the first setup.
- Dashboard action simulation is intentionally simplified for the alpha; SDK-backed simulation remains the canonical integration path.
