# MCP Server

Interlock includes an MCP server so AI agents and IDE agents can call the control plane directly.

This moves the product beyond a dashboard demo:

```text
agent runtime / IDE agent -> MCP tool -> Interlock SDK -> Mantle Sepolia
```

## Package

```text
packages/mcp
```

Run:

```bash
pnpm mcp
```

or:

```bash
pnpm --filter @interlock/mcp start
```

## Config

```json
{
  "mcpServers": {
    "interlock": {
      "command": "pnpm",
      "args": ["--filter", "@interlock/mcp", "start"],
      "env": {
        "MANTLE_RPC_URL": "https://rpc.sepolia.mantle.xyz",
        "AGENT_REGISTRY": "0xa8d6f3478b683ee674ff5a9167e6838c589162b4",
        "POLICY_REGISTRY": "0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0",
        "ACTION_ATTESTATION": "0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3",
        "FROM_BLOCK": "39344216"
      }
    }
  }
}
```

Add `PRIVATE_KEY` only if the agent should record decisions:

```json
{
  "PRIVATE_KEY": "0x..."
}
```

## Tools

### `interlock_get_status`

Returns RPC, chain, contract bytecode, private-key availability, and policy-pack registry health for the configured Mantle Sepolia environment.

### `interlock_preflight`

Runs policy checks, selector/target checks, native spend checks, slippage checks, and Mantle RPC simulation.

Does not send the transaction.

### `interlock_gateway_action`

Runs the agent gateway for one proposed transaction.

Modes:

- `dry-run`: read-only check, no wallet required.
- `record-only`: records the pre-flight decision, requires `PRIVATE_KEY`.
- `execute-if-allowed`: sends only allowed actions, requires `PRIVATE_KEY`.
- `block-and-alert`: returns an alert payload for blocked actions; recording requires `PRIVATE_KEY`.

Use this when an IDE/LLM agent needs one tool that can move from safe read-only checks to write-capable operation without changing the integration shape.

### `interlock_record_decision`

Runs pre-flight and records the resulting decision in `ActionAttestation`.

Requires `PRIVATE_KEY`.

### `interlock_run_benchmark`

Runs the default V2 safety benchmark suite for an agent and policy: safe path, unknown target, overspend, high slippage, unapproved approve selector, selector-only calldata simulation failure, and empty calldata selector check. Set `recordDecisions: true` only when `PRIVATE_KEY` is configured.

### `interlock_get_safety_card`

Builds an Agent Safety Card style summary from real AgentRegistry counters and ActionChecked history.

### `interlock_get_policy`

Reads policy limits and enumerable allowlists.

### `interlock_get_agent_history`

Reads real `ActionChecked` events from Mantle Sepolia.

### `interlock_explain_block`

Turns reason codes into plain-language explanations and developer next steps.

### `interlock_explain_decision`

Alias-style decision explainer for agent runtimes that think in decisions instead of "blocks".

### `interlock_create_policy_draft`

Creates a JSON policy draft from a Mantle track policy pack.

Template packs never include fake protocol addresses. They return required config fields instead.

### `interlock_create_policy_pack`

Creates a policy pack from the official Interlock registry.

### `interlock_validate_policy_pack`

Validates either the built-in registry or a provided policy pack JSON string.

## Example Agent Flow

```text
Agent wants to execute swap
  -> calls interlock_preflight
  -> receives BLOCK / UNKNOWN_SELECTOR
  -> calls interlock_explain_block
  -> updates tool plan or asks developer to approve selector
```

## Safety Notes

- MCP pre-flight is read-only without `PRIVATE_KEY`.
- `PRIVATE_KEY` is never required for checks.
- Attestations are pre-flight decision evidence, not proof of downstream execution.
- This is Dev Alpha and not an audited production wallet guard.
