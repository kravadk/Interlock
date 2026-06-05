# Viem Adapter

The Viem adapter is for teams that already have a `walletClient` in their agent runtime and want to add Interlock Firewall before `sendTransaction`.

Use this when you do not want to replace your wallet code with a new smart-account stack.

## Configure With Existing Wallet Client

```ts
import { InterlockFirewall, createGuardedViemWallet } from "@interlock/firewall-sdk";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepolia } from "@interlock/shared";

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({
  account,
  chain: mantleSepolia,
  transport: http(process.env.MANTLE_RPC_URL),
});

const firewall = new InterlockFirewall({
  chain: mantleSepolia,
  rpcUrl: process.env.MANTLE_RPC_URL!,
  walletClient,
  contracts: {
    agentRegistry: "0x...",
    policyRegistry: "0x...",
    actionAttestation: "0x...",
  },
});
```

## Wrap Transaction Sends

```ts
const guardedWallet = createGuardedViemWallet({
  firewall,
  walletClient,
  agentId: 1n,
  policyId: 1n,
  defaultMetadata: {
    route: "agent-runtime:rebalance",
  },
});

const result = await guardedWallet.sendTransaction({
  to: vaultAddress,
  value: 0n,
  data: depositCalldata,
});

console.log(result.sent, result.decision.reasonCode, result.attestationHash, result.transactionHash);
```

The adapter flow is:

```text
walletClient tx request
  -> firewall.checkAction
  -> ActionAttestation.recordAction
  -> walletClient.sendTransaction only if allowed
```

## Blocked Actions

By default, blocked actions throw `ActionBlockedError` after the block decision is recorded on-chain.

```ts
const guardedWallet = createGuardedViemWallet({
  firewall,
  walletClient,
  agentId,
  policyId,
  throwOnBlock: false,
});

const result = await guardedWallet.sendTransaction(tx);
if (!result.sent) {
  return {
    status: "blocked",
    reason: result.decision.reasonCode,
  };
}
```

## Agent Tool Output

For LLM/agent frameworks that expect JSON-safe tool output:

```ts
import { decisionToAgentToolResult } from "@interlock/firewall-sdk";

const toolResult = decisionToAgentToolResult(result.decision);
```

This strips the response down to decision, reason, risk score, hashes, explanation, and policy checks.
