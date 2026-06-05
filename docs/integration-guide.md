# Integration Guide

This guide shows how another Mantle AI-agent project can integrate Interlock Firewall before sending a transaction.

## Install

```bash
pnpm add @interlock/firewall-sdk
```

## Configure

```ts
import { InterlockFirewall } from "@interlock/firewall-sdk";
import { mantleSepolia } from "@interlock/shared";

const firewall = new InterlockFirewall({
  chain: mantleSepolia,
  rpcUrl: process.env.MANTLE_RPC_URL!,
  privateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}`,
  contracts: {
    agentRegistry: "0x...",
    policyRegistry: "0x...",
    actionAttestation: "0x...",
  },
});
```

## Create A Policy From A Preset

```ts
import { conservativeDeFiPolicy } from "@interlock/firewall-sdk";
import { parseEther } from "viem";

const preset = conservativeDeFiPolicy({
  targets: [agentRegistryAddress, policyRegistryAddress],
  maxNativeValue: parseEther("0.02"),
  maxSlippageBps: 100,
});

await firewall.createPolicyFromPreset({
  agentId: 1n,
  preset,
});
```

If your setup script needs the created id immediately, use the receipt-aware helper:

```ts
const result = await firewall.createPolicyFromPresetAndWait({
  agentId: 1n,
  preset,
});

console.log(result.policyId);
```

Presets are optional. They only generate the same `maxNativeValue`, `maxSlippageBps`, `targets`, and `selectors` that `PolicyRegistry.createPolicy` already expects.

## Maintain A Policy

Developers can update limits and allowlists from the SDK instead of calling `PolicyRegistry` manually:

```ts
await firewall.updatePolicy({
  policyId: 1n,
  maxNativeValue: parseEther("0.05"),
  maxSlippageBps: 100,
  active: true,
});

await firewall.setTargetAllowed({
  policyId: 1n,
  target: newVaultAddress,
  allowed: true,
});

await firewall.setSelectorAllowed({
  policyId: 1n,
  selector: "0xd0e30db0",
  allowed: true,
});
```

This is the intended lifecycle for production agent teams: start with a strict preset, then explicitly add contracts and function selectors as the agent gains more approved capabilities.

## Check An Action

```ts
const decision = await firewall.checkAction({
  agentId: 1n,
  policyId: 1n,
  tx: {
    to: agentRegistryAddress,
    value: 10000000000000000n,
    data: depositCalldata,
  },
  metadata: {
    intent: "Deposit into approved vault",
    expectedSlippageBps: 0,
  },
});
```

## Execute With The Guarded Wrapper

If the SDK is configured with the agent account or private key, `guardedSendTransaction()` gives the shortest safe path:

```ts
const result = await firewall.guardedSendTransaction({
  agentId: 1n,
  policyId: 1n,
  tx: {
    to: agentRegistryAddress,
    value: 10000000000000000n,
    data: depositCalldata,
  },
  metadata: {
    intent: "Deposit into approved vault",
    expectedSlippageBps: 0,
  },
});

console.log(result.sent, result.attestationHash, result.transactionHash);
```

The wrapper runs `checkAction()`, sends only allowed transactions, then records the pre-flight decision on-chain by default. Blocked actions are recorded without sending and throw `ActionBlockedError`. Use `recordTiming: "before-send"` only when you explicitly need to record the decision before attempting the transaction.

## Use The Agent Gateway

For agent runtimes, REST services, and MCP tools, `runGatewayAction()` is the clearest integration point. It keeps the product flow in one method:

```text
agent proposes tx -> Interlock checks -> allow/block -> optional record/send/alert
```

```ts
const result = await firewall.runGatewayAction(
  {
    agentId: 1n,
    policyId: 1n,
    tx: {
      to: agentRegistryAddress,
      value: 0n,
      data: depositCalldata,
    },
    metadata: {
      intent: "Agent wants to run an approved Mantle action",
      expectedSlippageBps: 0,
    },
  },
  {
    mode: "dry-run",
  },
);

if (result.status === "blocked") {
  console.log(result.decision.reasonCode, result.nextAction);
}
```

Use modes intentionally:

- `dry-run`: public/read-only checks, CI checks, judge demo, no wallet needed.
- `record-only`: write an on-chain pre-flight decision without sending the downstream tx.
- `execute-if-allowed`: send only allowed actions and record the decision.
- `block-and-alert`: return a structured alert payload when the action is blocked.

The gateway does not make an unsafe action safe. It standardizes how a developer calls Interlock before agent-controlled execution.

If your agent runtime already owns a Viem `walletClient`, use `createGuardedViemWallet()` instead:

```ts
import { createGuardedViemWallet } from "@interlock/firewall-sdk";

const guardedWallet = createGuardedViemWallet({
  firewall,
  walletClient,
  agentId: 1n,
  policyId: 1n,
});

const result = await guardedWallet.sendTransaction({
  to: agentRegistryAddress,
  value: 10000000000000000n,
  data: depositCalldata,
});
```

For frameworks that prefer to handle blocked decisions themselves:

```ts
const result = await firewall.guardedSendTransaction(action, {
  throwOnBlock: false,
});

if (!result.sent) {
  return {
    status: "blocked",
    reason: result.decision.reasonCode,
  };
}
```

## Execute Manually If Allowed

```ts
import { assertAllowed } from "@interlock/firewall-sdk";

assertAllowed(decision);

await walletClient.sendTransaction(decision.tx);
await firewall.recordDecision(decision);
```

If your service needs the audit-trail id immediately:

```ts
const attestation = await firewall.recordDecisionAndWait(decision);
console.log(attestation.actionCheckId);
```

Or handle blocked decisions manually:

```ts
if (!decision.allowed) {
  throw new Error(`Blocked: ${decision.reasonCode}`);
}

await walletClient.sendTransaction(decision.tx);
await firewall.recordDecision(decision);
```

## Expose A Firewall Tool To An Agent

For LLM and agent runtimes that propose transaction JSON, expose a check-only tool:

```ts
import { createAgentFirewallTool } from "@interlock/firewall-sdk";

const firewallTool = createAgentFirewallTool({
  firewall,
  agentId: 1n,
  policyId: 1n,
});

const result = await firewallTool.check({
  to: agentRegistryAddress,
  value: "10000000000000000",
  data: depositCalldata,
  intent: "Deposit into approved vault",
});
```

The tool returns JSON-safe allow/block output for the agent. Keep actual wallet execution in a separate controlled step.

## Expose A Backend Pre-Flight Endpoint

For web apps, bots, and backend agent runners, use the action handler to turn an agent-proposed JSON transaction into a stable API response:

```ts
import { createFirewallActionHandler } from "@interlock/firewall-sdk";

const handler = createFirewallActionHandler({
  firewall,
  agentId: 1n,
  policyId: 1n,
  recordDecision: true,
});

export async function POST(request: Request) {
  const body = await request.json();
  const result = await handler.handle(body);

  return Response.json(result, {
    status: result.ok ? 200 : 400,
  });
}
```

Example request:

```json
{
  "to": "0xe4dfef03e107225f2239cfff955a378a9a8158be",
  "value": "0",
  "data": "0xd0e30db0",
  "intent": "Deposit into approved vault"
}
```

This is the recommended path when an LLM or automation worker proposes raw transaction JSON and your service needs a typed allow/block response before any wallet execution.

## Read Action History

```ts
const history = await firewall.getActionHistory({
  agentId: 1n,
  fromBlock: deploymentBlock,
});

for (const action of history) {
  console.log(action.decision, action.reasonCode, action.transactionHash);
}
```

## Recommended Integration Point

Call `checkAction()` immediately before any agent-controlled `sendTransaction` or smart-wallet execution.

```text
LLM/tool planner -> proposed tx -> Interlock Firewall -> wallet execution
```

The dashboard mirrors this integration path in the Action Review panel. In live mode it reads `PolicyRegistry`, checks target and selector allowlists, runs a Mantle Sepolia `eth_call` simulation, then records the same allow/block decision to `ActionAttestation`.

`ActionAttestation` rejects `ALLOW` attestations when the target is not allowlisted, the function selector is not allowlisted, the native value is above the policy limit, or the reason code is not `POLICY_PASSED`. It still accepts valid `BLOCK` attestations for those cases, so the audit trail can show what the agent attempted and why the firewall stopped it.

## Demo Reason Codes

- `POLICY_PASSED`
- `TARGET_NOT_ALLOWED`
- `VALUE_LIMIT_EXCEEDED`
- `SLIPPAGE_LIMIT_EXCEEDED`
- `SIMULATION_FAILED`
- `UNKNOWN_SELECTOR`
