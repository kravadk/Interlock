# API Reference

This document describes the public SDK surface that developers should use first. Contract calls are available directly, but the SDK is the intended integration layer.

## InterlockFirewall

```ts
const firewall = new InterlockFirewall({
  chain,
  rpcUrl,
  privateKey,
  contracts: {
    agentRegistry,
    policyRegistry,
    actionAttestation,
  },
});
```

### checkAction(action)

Runs policy checks and simulation for a proposed transaction.

```ts
const decision = await firewall.checkAction({
  agentId,
  policyId,
  tx: {
    to,
    value,
    data,
  },
  metadata: {
    intent,
    expectedSlippageBps,
  },
});
```

Returns:

```ts
type FirewallDecision = {
  allowed: boolean;
  decision: "ALLOW" | "BLOCK" | "REVIEW";
  reasonCode: string;
  riskScore: number;
  simulationHash: Hex;
  calldataHash: Hex;
  explanation: string;
  tx: {
    to: Address;
    value: bigint;
    data: Hex;
  };
};
```

### recordDecision(decision)

Writes the allow/block pre-flight decision to `ActionAttestation`.

```ts
const txHash = await firewall.recordDecision(decision);
```

This records the firewall decision. It does not execute the proposed transaction and is not proof that the transaction was later mined.

### recordDecisionAndWait(decision)

Writes the allow/block decision, waits for the transaction receipt, and returns the emitted `ActionChecked` event data.

```ts
const attestation = await firewall.recordDecisionAndWait(decision);

console.log(attestation.actionCheckId, attestation.decision, attestation.reasonCode);
```

Use this in setup scripts, worker jobs, and CLIs where the caller needs a concrete audit-trail id immediately.

### guardedSendTransaction(action, options)

Runs preflight, sends only if allowed, and records the pre-flight decision. By default, allowed actions are recorded after `sendTransaction`; blocked actions are recorded without sending.

```ts
const result = await firewall.guardedSendTransaction(action, {
  throwOnBlock: false,
  recordDecision: true,
});
```

Returns:

```ts
type GuardedSendResult = {
  sent: boolean;
  decision: FirewallDecision;
  transactionHash?: Hex;
  attestationHash?: Hex;
};
```

### runGatewayAction(action, options)

Runs the same firewall pipeline through an agent-runtime friendly gateway mode. Use this when an AI agent framework, backend worker, MCP server, or REST endpoint wants one stable method instead of choosing between `checkAction`, `recordDecision`, and `guardedSendTransaction` manually.

Modes:

- `dry-run`: checks policy and simulation only. No send, no attestation.
- `record-only`: checks and records the pre-flight decision. No send.
- `execute-if-allowed`: checks, sends only if allowed, and records according to `recordTiming`.
- `block-and-alert`: checks and returns an alert payload for blocked actions. It does not send.

```ts
const result = await firewall.runGatewayAction(action, {
  mode: "execute-if-allowed",
  recordDecision: true,
  recordTiming: "after-send",
  throwOnBlock: false,
});

console.log(result.status, result.nextAction);
```

Returns:

```ts
type GatewayActionResult = {
  mode: "dry-run" | "record-only" | "execute-if-allowed" | "block-and-alert";
  status: "allowed" | "blocked" | "executed" | "recorded" | "alert";
  decision: FirewallDecision;
  sent: boolean;
  recorded: boolean;
  transactionHash?: Hex;
  attestationHash?: Hex;
  alert?: {
    event: "action.blocked";
    reasonCode: string;
    agentId: string;
    policyId: string;
    target: Address;
    selector: Hex;
    value: string;
  };
  nextAction: string;
};
```

`dry-run` works without a wallet. `record-only`, `execute-if-allowed`, and `block-and-alert` with `recordDecision: true` require a write-capable SDK config.

### getPolicy(policyId)

Reads a policy from `PolicyRegistry`.

```ts
const policy = await firewall.getPolicy(1n);
```

### getAgentStats(agentId)

Reads reputation counters from `AgentRegistry`.

```ts
const stats = await firewall.getAgentStats(1n);
```

### isTargetAllowed(policyId, target)

Reads target allowlist status from `PolicyRegistry`.

```ts
const allowed = await firewall.isTargetAllowed(1n, vaultAddress);
```

### isSelectorAllowed(policyId, selector)

Reads selector allowlist status from `PolicyRegistry`.

```ts
const allowed = await firewall.isSelectorAllowed(1n, "0xd0e30db0");
```

### checkPolicyPermissions(input)

Reads target and selector permissions in one helper.

```ts
const permissions = await firewall.checkPolicyPermissions({
  policyId: 1n,
  target: vaultAddress,
  selector: "0xd0e30db0",
});
```

### getActionHistory(filters)

Reads `ActionChecked` events.

```ts
const history = await firewall.getActionHistory({
  agentId: 1n,
  fromBlock: 0n,
});
```

### createPolicyFromPreset(input)

Creates a policy from an SDK preset.

```ts
await firewall.createPolicyFromPreset({
  agentId: 1n,
  preset: conservativeDeFiPolicy({
    targets: [agentRegistryAddress],
    maxNativeValue: parseEther("0.02"),
    maxSlippageBps: 100,
  }),
});
```

### registerAgentAndWait(input)

Registers an agent, waits for the transaction receipt, and returns the emitted `AgentRegistered` data.

```ts
const result = await firewall.registerAgentAndWait({
  metadataURI: "ipfs://interlock-demo-agent",
});

console.log(result.agentId, result.transactionHash);
```

### createPolicyAndWait(input)

Creates a policy, waits for the transaction receipt, and returns the emitted `PolicyCreated` data.

```ts
const result = await firewall.createPolicyAndWait({
  agentId: 1n,
  maxNativeValue: parseEther("0.02"),
  maxSlippageBps: 100,
  targets: [vaultAddress],
  selectors: ["0xd0e30db0"],
});

console.log(result.policyId, result.transactionHash);
```

### createPolicyFromPresetAndWait(input)

Same as `createPolicyFromPreset`, but waits for the receipt and returns `policyId`.

## Dispute Window, Enforcement, and Reputation

Covers the EIP-712 dispute window and evidence commitment on current `ActionAttestationV3`, plus the additive on-chain contracts.
Pass the relevant address from `deployedAddresses.mantleSepolia`.

- `challengeAction(actionCheckId, reason)` / `finalizeAction(actionCheckId)` — challenge a record
  within its dispute window, or finalize it after.
- `executeThroughGuard({ executor, agentId, policyId, target, value, data })` — route through
  `PolicyGuardedExecutor`; an ALLOW executes, a BLOCK reverts on-chain. `previewGuard(...)` is a
  read-only dry-run returning `{ allowed, reasonCode }`.
- `bondRecord` / `openDispute` / `resolveDispute` / `withdrawDisputeFunds` — two-sided dispute
  staking on `DisputeEscrow`; the arbiter-chosen winner takes both bonds.
- `committeeApproved(committee, digest, signatures)` — true if a digest carries ≥ threshold distinct
  `AttestorCommittee` signatures.
- `getReputation(oracle, agentId)` — `{ scoreBps, tier }` from `ReputationOracle`.

## Policy Packs

Policy packs are JSON-safe policy configs intended for repositories, CI checks, and repeatable environment setup.

```ts
import {
  conservativeDeFiPolicy,
  parsePolicyPack,
  policyPackFromPreset,
  policyPackToCreatePolicyInput,
} from "@interlock/firewall-sdk";

const pack = policyPackFromPreset(
  conservativeDeFiPolicy({
    targets: [vaultAddress],
  }),
  { chainId: 5003 },
);

const parsed = parsePolicyPack(JSON.stringify(pack));
const input = policyPackToCreatePolicyInput(1n, parsed);
await firewall.createPolicyAndWait(input);
```

Use policy packs when a developer team wants policy changes to be visible in PR review instead of hidden in deployment scripts.

### auditPolicyPack(input)

Compares a JSON policy pack with the current on-chain policy state.

```ts
const audit = await firewall.auditPolicyPack({
  policyId: 1n,
  expectedAgentId: 1n,
  pack,
});

if (!audit.ok) {
  console.log(audit.mismatches);
}
```

The audit checks policy limits, active state, optional agent ownership, every target in the pack, and every selector in the pack. It is intended for CI drift checks after deployment or after manual policy maintenance.

Exact audit requires `PolicyRegistry` v1.1.0+ with `supportsPolicyEnumeration()`. Passing `allowLegacyPartialAudit: true` permits a partial legacy audit, but that mode cannot detect extra on-chain allowlist entries that are missing from the pack.

### applyPolicyPack(input)

Applies the parts of a policy pack that the MVP contract can safely reconcile.

```ts
const result = await firewall.applyPolicyPack({
  policyId: 1n,
  expectedAgentId: 1n,
  pack,
  dryRun: true,
});

console.log(result.plannedOperations);
```

Without `dryRun`, the SDK can:

- update `maxNativeValue`, `maxSlippageBps`, and `active`;
- allow missing targets;
- allow missing selectors.

With `prune: true`, it also revokes extra on-chain targets/selectors that are not present in the policy pack.

```ts
await firewall.applyPolicyPack({
  policyId: 1n,
  expectedAgentId: 1n,
  pack,
  prune: true,
});
```

### updatePolicy(input)

Updates policy limits and active state.

```ts
await firewall.updatePolicy({
  policyId: 1n,
  maxNativeValue: parseEther("0.05"),
  maxSlippageBps: 100,
  active: true,
});
```

### setTargetAllowed(input)

Adds or removes an allowed target.

```ts
await firewall.setTargetAllowed({
  policyId: 1n,
  target: vaultAddress,
  allowed: true,
});
```

### setSelectorAllowed(input)

Adds or removes an allowed function selector.

```ts
await firewall.setSelectorAllowed({
  policyId: 1n,
  selector: "0xd0e30db0",
  allowed: true,
});
```

## Helpers

### assertAllowed(decision)

Throws `ActionBlockedError` when the decision is not allowed.

```ts
assertAllowed(decision);
await walletClient.sendTransaction(decision.tx);
```

### createGuardedViemWallet(input)

Wraps a Viem wallet client with firewall enforcement.

```ts
const guardedWallet = createGuardedViemWallet({
  firewall,
  walletClient,
  agentId,
  policyId,
});

await guardedWallet.sendTransaction(tx);
```

### createAgentFirewallTool(input)

Creates a JSON-safe preflight tool for LLM/agent runtimes.

```ts
const tool = createAgentFirewallTool({ firewall, agentId, policyId });
const result = await tool.check({ to, value, data, intent });
```

Keep execution outside the LLM tool. The tool should check and explain; the runtime should execute.

### createFirewallActionHandler(input)

Creates a JSON-safe backend handler for API routes and worker services that receive agent-proposed transaction JSON.

```ts
const handler = createFirewallActionHandler({
  firewall,
  agentId,
  policyId,
  recordDecision: true,
});

const response = await handler.handle({
  to,
  value,
  data,
  intent,
});
```

Allowed response:

```ts
{
  ok: true,
  status: "allowed",
  decision,
  attestationHash
}
```

Blocked response:

```ts
{
  ok: true,
  status: "blocked",
  decision,
  attestationHash
}
```

Invalid input response:

```ts
{
  ok: false,
  status: "error",
  code,
  message
}
```

### withInterlockFirewall(tool, firewall, options)

Wraps a tool that has separate `plan()` and `execute()` steps.

```ts
const guardedTool = withInterlockFirewall(tool, firewall, {
  recordDecision: true,
  throwOnBlock: false,
});

const result = await guardedTool.run(input);
```

Tool shape:

```ts
type PlannedAgentTool<TInput, TOutput> = {
  name: string;
  plan(input: TInput): AgentAction | Promise<AgentAction>;
  execute(action: AgentAction, context: { input: TInput; decision: FirewallDecision }): TOutput | Promise<TOutput>;
};
```

Blocked result:

```ts
{
  status: "blocked",
  decision
}
```

Allowed result:

```ts
{
  status: "executed",
  decision,
  output
}
```

Use this wrapper for GOAT/AgentKit-style tools where a framework can plan a transaction before the runtime executes it.
