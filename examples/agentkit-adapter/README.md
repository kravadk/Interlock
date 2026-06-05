# AgentKit-Style Adapter Example

This example shows how to place Interlock Firewall in front of an AgentKit-style action provider without making `@coinbase/agentkit` a hard dependency of this repo.

Target integration shape:

```text
AgentKit action provider -> prepare transaction -> Interlock pre-flight -> wallet provider sends only if ALLOW
```

The key product boundary is that AgentKit-style providers can expose on-chain actions to an agent, while Interlock Firewall decides whether a prepared transaction is safe enough to execute under the selected policy.

## Files

- `src/adapter.ts` exports the reusable `guardAgentKitStyleProvider` wrapper and a minimal `createAgentKitStyleReadAgentProvider` example.
- `src/index.ts` is only the runnable demo entrypoint.

Use `src/adapter.ts` as the copy point for a real AgentKit runtime. The demo intentionally keeps `@coinbase/agentkit` out of dependencies so this monorepo can typecheck without installing a full agent stack.

## Run

Configuration readiness check:

```bash
pnpm --filter @interlock/example-agentkit-adapter demo
```

Live pre-flight check with a real registered agent and policy:

```bash
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz \
AGENT_ID=<real_agent_id> \
POLICY_ID=<real_policy_id> \
pnpm --filter @interlock/example-agentkit-adapter demo
```

Optional env:

- `ACTION_TARGET` - defaults to the deployed `AgentRegistry`.
- `ACTION_VALUE_MNT` - defaults to `0`.

## What This Proves

- AgentKit-style providers can keep wallet/action-provider responsibilities.
- Interlock Firewall can wrap the action before the wallet provider sends.
- The integration is incremental: no smart-account migration is required.
