# @interlock/firewall-sdk

TypeScript SDK for Interlock Firewall pre-flight checks on Mantle Sepolia.

Use this package when an AI agent, backend worker, or wallet integration has a proposed transaction and needs a policy decision before sending it.

```ts
import { InterlockFirewall, agentRegistryGetAgentCalldata } from "@interlock/firewall-sdk";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";

const firewall = new InterlockFirewall({
  chain: mantleSepolia,
  rpcUrl: process.env.MANTLE_RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  contracts: deployedAddresses.mantleSepolia,
});

const decision = await firewall.checkAction({
  agentId: 1n,
  policyId: 1n,
  tx: {
    to: deployedAddresses.mantleSepolia.agentRegistry,
    value: 0n,
    data: agentRegistryGetAgentCalldata(1n),
  },
  metadata: {
    intent: "Read agent profile before the agent continues.",
  },
});

if (!decision.allowed) {
  console.log(decision.reasonCode);
}
```

## Main Exports

- `InterlockFirewall`: core Viem-based pre-flight and attestation client.
- `checkAction`: reads policy, simulates the transaction, and returns `ALLOW` or `BLOCK`.
- `recordDecision`: writes the pre-flight decision to `ActionAttestation`; it does not prove execution.
- `guardedSendTransaction`: sends allowed actions first and records the pre-flight decision after send by default.
- `createFirewallActionHandler`: small backend/REST handler wrapper.
- `withInterlockFirewall`: wraps an existing agent tool with pre-flight checks.
- `agentRegistryGetAgentCalldata`: helper for full calldata generation.
- `policyPackFromPreset`: turns policy presets into portable JSON policy packs.
- `runInterlockBenchmark`: runs the default V2 safety benchmark suite for an agent and policy, including safe path, target, value, slippage, selector, empty-calldata, and simulation-failure scenarios.
- `listPolicyPackRegistryEntries`: returns official Mantle policy-pack registry metadata with trust tiers and content hashes.

## Error Model

SDK errors extend `InterlockError` and include:

- `code`: stable machine-readable error code.
- `message`: what failed.
- `action`: what the developer should do next.

Use `actionableError(error)` in API or CLI boundaries to return consistent developer-facing failures.

Input validation rejects negative value, odd-length calldata such as `0x0`, non-positive ids, invalid selectors, and slippage outside `0..10000` before RPC simulation.

## Dev Alpha Scope

This package targets Mantle Sepolia developer alpha. It is not a production custody or mainnet security product. Production use requires signed decision receipts, replay protection, stricter contract authorization, and a security review.
