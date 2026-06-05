# Policies

Policies define what an agent can do before a transaction is allowed.

## Policy Philosophy

Keep the on-chain policy compact:

- target allowlist;
- selector allowlist;
- native value limit;
- slippage limit;
- active flag.

Keep richer explanations and JSON profiles off-chain:

- human-readable policy name;
- protocol category;
- reason text;
- framework metadata;
- policy profile hash.

This keeps gas low while preserving an auditable enforcement layer.

## Current Policy Fields

- `agentId`: agent controlled by this policy.
- `owner`: address allowed to update the policy.
- `maxNativeValue`: maximum native token value per action.
- `maxSlippageBps`: maximum expected slippage in basis points.
- `active`: whether policy is usable.
- `allowedTargets`: contracts the agent may call.
- `allowedSelectors`: function selectors the agent may call.

## Reason Codes

- `POLICY_PASSED`
- `TARGET_NOT_ALLOWED`
- `VALUE_LIMIT_EXCEEDED`
- `SLIPPAGE_LIMIT_EXCEEDED`
- `SIMULATION_FAILED`
- `UNKNOWN_SELECTOR`

## Presets

### conservative-defi

For low-spend vault/router interactions.

Allows:

- ERC-4626-like deposit/mint selectors;
- demo vault deposit;
- demo router swap.

Blocks:

- arbitrary approvals by default;
- unknown targets;
- high value.

### payments

For payment or payout agents.

Allows:

- controlled native transfers;
- explicit recipients/targets.

### rwa-read-only

For agents that inspect RWA-like contracts or call safe read-oriented flows.

Use this when the action should not move meaningful funds.

### approvals

For approval-specific flows.

Warning: approval policies are risky. The current MVP checks target and selector, not the spender encoded inside calldata. Use only for controlled demos or extend policy checks before production.

## Recommended Lifecycle

1. Start from a strict preset.
2. Add only the target contracts the agent needs.
3. Add only the selectors the agent needs.
4. Set a low native value limit.
5. Run safe and blocked examples.
6. Review Flight Recorder history.
7. Increase limits only after observed behavior is clean.
