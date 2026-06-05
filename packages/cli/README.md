# @interlock/cli

Command line interface for Interlock Firewall setup, debugging, CI checks, and policy operations.

```bash
interlock init --out .env.interlock.local
interlock doctor --no-fail
interlock status --agent-id <real_agent_id> --policy-id <real_policy_id>
interlock whoami
interlock benchmark run --agent-id <real_agent_id> --policy-id <real_policy_id>
interlock agent-get --agent-id <real_agent_id>
interlock policy-get --policy-id <real_policy_id>
interlock preflight --agent-id <real_agent_id> --policy-id <real_policy_id> --to <real_target_address> --value 0 --data 0x
```

## Common Commands

- `doctor`: verify RPC, chain id, contract bytecode, env, and optional indexer health.
- `init`: create an Interlock env file without overwriting unless `--force` is set.
- `quickstart`: register an agent, create a basic policy, run safe and blocked pre-flight checks.
- `status`: show RPC, contract, indexer, selected agent/policy, and next steps.
- `whoami`: show active chain, account source, selected ids, RPC, and contracts.
- `benchmark run`: run the default V2 Interlock benchmark suite with safe path, target, value, slippage, selector, empty-calldata, and simulation-failure scenarios.
- `register-agent`: register an agent identity.
- `policy-create`: create a policy with explicit targets and selectors.
- `policy-create-preset`: create a policy from a preset.
- `policy-pack`: print a JSON policy pack.
- `policy-pack-registry`: validate and print the official policy pack registry.
- `policy-audit`: compare an on-chain policy with a policy pack.
- `preflight`: run SDK pre-flight and print JSON output.
- `record`: run pre-flight and record the pre-flight decision on-chain.
- `history`: read indexed or RPC action history.

The CLI validates input before RPC calls: calldata must be `0x` or even-byte hex, native value cannot be negative, and slippage must be `0..10000` bps.

## Required Env For Writes

```bash
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
PRIVATE_KEY=...
AGENT_REGISTRY=...
POLICY_REGISTRY=...
ACTION_ATTESTATION=...
```

Read commands can run without `PRIVATE_KEY`. Write commands return actionable errors when the key, wallet funds, chain, or contract config is missing.

## Dev Alpha Scope

The CLI is intended for Mantle Sepolia setup and developer workflows. Do not use it as a production mainnet security boundary before the production hardening checklist is complete.
