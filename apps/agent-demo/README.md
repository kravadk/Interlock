# @interlock/agent-demo

Reference autonomous agent that drives the Interlock firewall on **Mantle Sepolia**. It proposes safe
and adversarial actions, runs each through the firewall (`checkAction`), and records the decision
on-chain (`recordDecisionAndWait`) for both `ALLOW` and `BLOCK`, since a `BLOCK` attestation is
pre-flight evidence too. Recorded decisions auto-index and stream into the dashboard's Flight
Recorder.

## Modes

```bash
# One-shot benchmark (V2 safety suite, read-only by default)
pnpm --filter @interlock/agent-demo demo
RECORD_DECISIONS=true pnpm --filter @interlock/agent-demo demo   # also record on-chain

# Autonomous loop - rotates scenarios, records each decision
pnpm --filter @interlock/agent-demo demo:loop -- --iterations 3 --interval 4
pnpm --filter @interlock/agent-demo demo:loop                    # continuous (Ctrl-C to stop)
```

`demo:loop` (`src/loop.ts`) requires `PRIVATE_KEY` + `AGENT_ID` + `POLICY_ID` from a registered agent
and policy on the deployment. Each step is one `recordAction` transaction.

The same loop is exposed from the dashboard's **Agent Demo** tab via `/api/demo/run`, and the same
flow is available to AI agents through the MCP server (`interlock_preflight` -> `interlock_record_decision`).

The one-shot benchmark covers safe path, unknown target, overspend, high slippage, unapproved approve
selector, selector-only calldata simulation failure, and empty-calldata selector checks. Output is a
V2 JSON report with track/category coverage and remediation.

> Dev Alpha - testnet only. The demo spends testnet gas per recorded decision.
