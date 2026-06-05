# Agent Framework Adapter Example

This example shows the intended integration pattern for GOAT, AgentKit, LangChain, Vercel AI SDK, or a custom agent runtime:

```text
agent tool plans tx
  -> Interlock Firewall checks tx
  -> tool executes only if allowed
```

Run without env to verify the adapter is configured for Mantle Sepolia:

```bash
pnpm --filter @interlock/example-agent-framework demo
```

Set `AGENT_ID` to read a real registered agent. Set `POLICY_ID` to run a live pre-flight check around the planned tool action.
