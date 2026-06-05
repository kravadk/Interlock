# Vercel AI SDK-style Adapter Example

Dependency-light example for wrapping a Vercel AI SDK-style tool with Interlock Firewall.

```bash
pnpm --filter @interlock/example-vercel-ai-adapter demo
```

Without `AGENT_ID`, the command prints real Mantle Sepolia configuration readiness. Set:

- `AGENT_ID` to read a real registered agent.
- `POLICY_ID` to run a live Interlock pre-flight check.
- `ACTION_TARGET` to override the real target address.

The example models the integration boundary: an AI tool prepares a transaction-like action, Interlock runs policy/simulation checks, and the tool executes only when the decision is `ALLOW`.
