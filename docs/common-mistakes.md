# Common Developer Mistakes

Use this checklist when an integration behaves differently from the dashboard or CLI.

## Passing Selector-Only Calldata

`0x2de5aaf7` identifies `getAgent(uint256)`, but it is not enough to call the function. Functions with arguments need full ABI-encoded calldata.

Use SDK helpers for known Interlock actions:

```ts
import { agentRegistryGetAgentCalldata } from "@interlock/firewall-sdk";

const data = agentRegistryGetAgentCalldata(agentId);
```

For unknown contracts, use Viem `encodeFunctionData` with the target ABI.

Empty calldata is `0x`. Odd-length hex like `0x0` is invalid and is rejected before RPC simulation.

## Invalid Slippage Or Value Input

Native value must be non-negative. Slippage is basis points and must be an integer in `0..10000`.

## Wrong Chain Or Contract Address

Mantle Sepolia uses chain id `5003`. If reads fail or writes revert, verify:

- wallet chain id;
- `MANTLE_RPC_URL`;
- `AGENT_REGISTRY`;
- `POLICY_REGISTRY`;
- `ACTION_ATTESTATION`;
- deployed bytecode with `pnpm cli -- doctor`.

## Stale Policy Or Agent IDs

A policy belongs to a specific agent. If a developer uses a policy from another agent, the SDK may read it, but attestation or business logic can fail.

Use:

```bash
pnpm cli -- policy-get --policy-id <id>
pnpm cli -- agent-get --agent-id <id>
```

## Recording Before Understanding Execution Order

The safe app flow is:

```text
checkAction -> if allowed execute transaction -> record decision/result
```

`guardedSendTransaction()` now follows this order by default for allowed actions. If an alpha demo needs to record before send, pass `recordTiming: "before-send"` explicitly and document that it is a pre-flight decision, not execution proof.

## Running Indexer From Block 0

Syncing from block `0` is slow and unnecessary for a known deployment. Use the deployment manifest `FROM_BLOCK` value and verify `/health`.

## Missing Private Key For Write Commands

Read methods work without a wallet. Write methods require a wallet client or private key:

```bash
PRIVATE_KEY=0x... pnpm cli -- record ...
```

If missing, the SDK returns `WALLET_CLIENT_REQUIRED` with an action hint.

## Expecting Protocol-Level Safety

Interlock checks target, selector, value, slippage, active policy, and RPC simulation. It does not guarantee that an allowlisted protocol or spender is safe.

Be careful with broad `approve` policies. The alpha policy model checks selector and target, not the spender encoded inside calldata.

## Treating Reputation Counters As Production Reputation

Current reputation is simple counters: allowed, blocked, failed simulations. It is useful for debugging and demos, not production identity or trust scoring.

## Dashboard Without Indexer

The dashboard can run without the indexer, but Flight Recorder history requires the indexer API.

Start it with:

```bash
pnpm indexer:live
```

Then set:

```bash
NEXT_PUBLIC_INDEXER_URL=<recorder_api_url>
```

## RPC Rate Limits

Transient RPC failures can cause simulation or indexer sync errors. Retry after checking `/health`, RPC status, and request volume.
