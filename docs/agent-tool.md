# Agent Tool Wrapper

The agent tool wrapper is a framework-neutral way to expose Interlock Firewall to LLM and agent runtimes.

Use it when an agent proposes a transaction as JSON and you want a pre-flight answer before any execution step.

## Create The Tool

```ts
import { InterlockFirewall, createAgentFirewallTool } from "@interlock/firewall-sdk";

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

const firewallTool = createAgentFirewallTool({
  firewall,
  agentId: 1n,
  policyId: 1n,
  defaultMetadata: {
    route: "llm-agent",
  },
});
```

## Check A Proposed Action

```ts
const result = await firewallTool.check({
  to: "0xVault...",
  value: "1000000000000000",
  data: "0xd0e30db0",
  intent: "Deposit test funds into approved vault",
  expectedSlippageBps: 0,
});
```

The result is JSON-safe:

```json
{
  "allowed": true,
  "decision": "ALLOW",
  "reasonCode": "POLICY_PASSED",
  "riskScore": 8,
  "agentId": "1",
  "policyId": "1",
  "action": {
    "to": "0x...",
    "value": "1000000000000000",
    "data": "0xd0e30db0"
  }
}
```

## How To Use In An Agent Runtime

Recommended runtime flow:

```text
LLM proposes transaction JSON
  -> interlock_firewall_check tool
  -> if allowed: controlled wallet execution
  -> record attestation through guarded wallet or SDK
  -> return tx hash to agent/user
```

Do not let the LLM call raw `sendTransaction` directly. Keep the execution tool separate and make it accept only a firewall-approved action.

## Input Validation

The wrapper validates:

- `to` is an EVM address;
- `data` is a `0x` hex string;
- `value`, `agentId`, and `policyId` are non-negative integers;
- bigint fields are returned as decimal strings for JSON compatibility.

Invalid inputs throw `AgentToolInputError` with code `AGENT_TOOL_INPUT_INVALID`.
