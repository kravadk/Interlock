# Raw Viem Example

This example shows where Interlock Firewall sits in a normal Viem transaction pipeline.

```text
build tx -> firewall.checkAction -> walletClient.sendTransaction -> firewall.recordDecision
```

Run without env to verify the example is configured for Mantle Sepolia:

```bash
pnpm --filter @interlock/example-raw-viem demo
```

Set `AGENT_ID` to read a real registered agent from `AgentRegistry`. Set `PRIVATE_KEY` and `POLICY_ID` to send a guarded transaction against the configured `ACTION_TARGET`.
