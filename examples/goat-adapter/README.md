# GOAT-Style Adapter Example

This example shows how to place Interlock Firewall in front of a GOAT-style tool without making GOAT a hard dependency of this repo.

Target integration shape:

```text
GOAT tool/action -> build proposed transaction -> Interlock pre-flight -> execute only if ALLOW
```

The important rule is that the tool may plan a transaction, but the runtime should not execute it until Interlock returns `ALLOW`.

## Files

- `src/adapter.ts` exports the reusable `guardGoatStyleTool` wrapper and a minimal `createGoatStyleReadAgentTool` example.
- `src/index.ts` is only the runnable demo entrypoint.

Use `src/adapter.ts` as the copy point for a real GOAT-style runtime. The demo intentionally keeps GOAT out of dependencies so this monorepo can typecheck without installing a full agent stack.

## Run

Configuration readiness check:

```bash
pnpm --filter @interlock/example-goat-adapter demo
```

Live pre-flight check with a real registered agent and policy:

```bash
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz \
AGENT_ID=<real_agent_id> \
POLICY_ID=<real_policy_id> \
pnpm --filter @interlock/example-goat-adapter demo
```

Optional env:

- `ACTION_TARGET` - defaults to the deployed `AgentRegistry`.
- `ACTION_VALUE_MNT` - defaults to `0`.

## What This Proves

- Existing toolkits can keep their own action providers.
- Interlock only needs the proposed transaction.
- Blocked decisions stop execution before the tool sends anything.
- The same pattern can later be turned into a package-level GOAT plugin.
