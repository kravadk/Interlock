# Adapters

Adapters make Interlock Firewall usable inside existing agent frameworks without forcing teams to rewrite their agents.

## Adapter Principle

The agent framework can plan actions. Interlock Firewall decides whether the planned on-chain action is allowed.

```text
framework tool -> proposed tx -> firewall.checkAction -> execute or block
```

## Raw Viem

Use the SDK directly with Viem wallet/public clients.

```ts
const decision = await firewall.checkAction(action);

if (decision.allowed) {
  await walletClient.sendTransaction(decision.tx);
}

await firewall.recordDecision(decision);
```

Current example:

```bash
pnpm --filter @interlock/example-raw-viem demo
```

## Guarded Viem Wallet

Use `createGuardedViemWallet` when a runtime already has a Viem wallet client.

```ts
const guardedWallet = createGuardedViemWallet({
  firewall,
  walletClient,
  agentId,
  policyId,
});

await guardedWallet.sendTransaction(tx);
```

## Agent Tool Wrapper

Use `createAgentFirewallTool` when the agent runtime needs a JSON-safe tool.

```ts
const tool = createAgentFirewallTool({ firewall, agentId, policyId });
const result = await tool.check({ to, value, data, intent });
```

This should be check-only. Execution should remain in controlled app code.

## Tool Execution Wrapper

Use `withInterlockFirewall` when a tool can both plan and execute an action.

```ts
const guardedTool = withInterlockFirewall(tool, firewall);
const result = await guardedTool.run(input);

if (result.status === "blocked") {
  return result.decision.reasonCode;
}

return result.output;
```

The wrapper calls:

```text
tool.plan(input) -> firewall.checkAction(action) -> tool.execute(action)
```

`tool.execute` is never called for blocked decisions.

## GOAT-style Adapter

Target shape:

```text
GOAT action/tool
  -> produce tx
  -> Interlock preflight
  -> execute if allowed
```

Current example:

```bash
pnpm --filter @interlock/example-goat-adapter demo
```

The example is dependency-light on purpose. It models a GOAT-style tool shape without importing GOAT packages, so the Interlock integration boundary is clear: the tool builds an `AgentAction`, `withInterlockFirewall` runs the pre-flight check, and `execute` is called only for allowed decisions.

## AgentKit-style Adapter

Target shape:

```text
AgentKit wallet action
  -> planned transaction
  -> firewall.checkAction
  -> send transaction or return blocked result
```

Current example:

```bash
pnpm --filter @interlock/example-agentkit-adapter demo
```

The example models an AgentKit-style action provider without importing `@coinbase/agentkit`. A real provider would keep AgentKit's wallet/action-provider responsibilities and call Interlock immediately before wallet execution.

## Byreal / RealClaw-style Adapter

Target shape:

```text
RealClaw/OpenClaw skill
  -> proposed Mantle EVM action
  -> normalizeByrealSkillAction
  -> runGatewayAction
  -> continue, block, record, or alert
```

Current example:

```bash
pnpm --filter @interlock/example-byreal-realclaw-adapter demo
```

The SDK helper `normalizeByrealSkillAction()` validates chain id, agent/policy ids, target address, calldata, value, and slippage before RPC. The example does not import private RealClaw APIs and does not hardcode fake Byreal protocol addresses; production teams pass real skill targets and calldata.

## Vercel AI SDK-style Adapter

Target shape:

```text
Vercel AI SDK tool
  -> prepare tx-like action
  -> Interlock preflight
  -> execute only if allowed
```

Current example:

```bash
pnpm --filter @interlock/example-vercel-ai-adapter demo
```

The example is dependency-light on purpose. It models a Vercel AI SDK-style tool without importing the full AI SDK, so teams can see the integration boundary clearly: the tool prepares an `AgentAction`, Interlock checks it, and execution is skipped for blocked decisions.

## LangChain-style Adapter

Target shape:

```text
LangChain structured tool
  -> plan transaction
  -> firewall.checkAction
  -> call only after ALLOW
```

Current example:

```bash
pnpm --filter @interlock/example-langchain-adapter demo
```

The example models a structured LangChain tool without importing LangChain packages. Production integrations should keep private-key execution outside the LLM tool itself and call Interlock immediately before deterministic runtime execution.

## General LangChain / Vercel AI SDK Guidance

Recommended pattern:

- expose a `check_transaction` tool;
- return `allowed`, `reasonCode`, `riskScore`, `explanation`;
- do not expose raw private-key execution as an LLM tool;
- execute only in deterministic runtime code after `allowed === true`.
