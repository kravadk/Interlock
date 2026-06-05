# Backend Automation Example

This example shows how a backend worker, cron job, or autonomous strategy runner can call Interlock Firewall before transaction execution.

Run without env to verify the worker is configured for Mantle Sepolia:

```bash
pnpm --filter @interlock/example-backend-automation demo
```

Set `AGENT_ID` to read a real registered agent. Set `PRIVATE_KEY`, `POLICY_ID`, and optionally `ACTION_TARGET` to let the worker submit a guarded action.

```text
worker job
  -> build proposed tx
  -> firewall.checkAction
  -> if blocked: log and stop
  -> if allowed: execute and record
```
