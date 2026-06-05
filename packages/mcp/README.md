# @interlock/mcp

MCP server for Interlock Control Plane on Mantle Sepolia.

It gives AI agents a tool-native path to:

- run pre-flight checks before on-chain execution;
- explain allow/block decisions;
- read policy allowlists;
- inspect real `ActionChecked` history;
- record decision attestations when `PRIVATE_KEY` is configured;
- draft Mantle track policy packs without fake protocol addresses.

## Run

```bash
pnpm --filter @interlock/mcp start
```

For writes:

```bash
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz \
PRIVATE_KEY=0x... \
pnpm --filter @interlock/mcp start
```

## Codex/Cursor/Claude Config

```json
{
  "mcpServers": {
    "interlock": {
      "command": "pnpm",
      "args": ["--filter", "@interlock/mcp", "start"],
      "env": {
        "MANTLE_RPC_URL": "https://rpc.sepolia.mantle.xyz",
        "AGENT_REGISTRY": "0x2365d06cb8445243dea90c7407f604e71124209b",
        "POLICY_REGISTRY": "0xf142c809a11c11ec28ce292a478e6010cb4c9d24",
        "ACTION_ATTESTATION": "0xf62727d6bab242d35898438ef1d2315d3c45ffbb",
        "FROM_BLOCK": "39258697"
      }
    }
  }
}
```

## Tools

- `interlock_get_status`
- `interlock_preflight`
- `interlock_record_decision`
- `interlock_run_benchmark`
- `interlock_get_safety_card`
- `interlock_get_policy`
- `interlock_get_agent_history`
- `interlock_explain_block`
- `interlock_explain_decision`
- `interlock_create_policy_draft`
- `interlock_create_policy_pack`
- `interlock_validate_policy_pack`

Attestations are pre-flight decision evidence, not proof that a downstream transaction executed.
