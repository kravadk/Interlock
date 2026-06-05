# LangChain-style Adapter Example

Dependency-light example for wrapping a LangChain-style structured tool with Interlock Firewall.

```bash
pnpm --filter @interlock/example-langchain-adapter demo
```

Without `AGENT_ID`, the command prints real Mantle Sepolia configuration readiness. Set:

- `AGENT_ID` to read a real registered agent.
- `POLICY_ID` to run a live Interlock pre-flight check.
- `ACTION_TARGET` to override the real target address.

The wrapper demonstrates the correct split: the agent tool plans a transaction, Interlock checks it, and execution only happens for `ALLOW`.
