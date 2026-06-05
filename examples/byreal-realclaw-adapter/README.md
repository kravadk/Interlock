# Byreal / RealClaw Adapter Example

This example shows how a Byreal Agent Skills, OpenClaw, or RealClaw-style runtime can pass a proposed Mantle transaction through Interlock before execution.

```text
RealClaw/OpenClaw skill proposes EVM action
  -> normalizeByrealSkillAction()
  -> Interlock Agent Gateway
  -> ALLOW/BLOCK
  -> skill runtime decides whether to continue
```

Run without env to verify the adapter is configured:

```bash
pnpm --filter @interlock/example-byreal-realclaw-adapter demo
```

Run a live read-only gateway check:

```bash
AGENT_ID=<real_agent_id> POLICY_ID=<real_policy_id> pnpm --filter @interlock/example-byreal-realclaw-adapter demo
```

Optional env:

- `ACTION_TARGET`: real deployed target contract address. Defaults to the deployed Interlock `AgentRegistry` test target, not a fake Byreal protocol address.
- `ACTION_CALLDATA`: full calldata. Defaults to `AgentRegistry.getAgent(agentId)` calldata.
- `ACTION_VALUE_WEI`: native value in wei.
- `ACTION_SKILL_ID`: RealClaw/OpenClaw skill id label.
- `ACTION_STRATEGY`: strategy label such as `SteadyClaw` or a team-defined strategy.
- `ACTION_SLIPPAGE_BPS`: expected slippage in basis points.

The adapter intentionally does not ship hardcoded Byreal, Merchant Moe, Agni, Fluxion, or RWA addresses. Teams must provide real target addresses for real strategy integration.

Useful links:

- [RealClaw](https://www-ppe.byreal.io/en/realclaw)
- [OpenClaw](https://openclaw.mantle.xyz/)
- [Mantle docs](https://docs.mantle.xyz/)
