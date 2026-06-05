# Contracts

Interlock Control Plane uses three core contracts. Optional test strategy contracts can be deployed when the project needs a real Mantle Sepolia action flow for benchmark and policy pack demos.

## AgentRegistry

Purpose:

- register agent identities;
- store owner and metadata URI;
- store reputation counters.

Core reads/writes:

- `registerAgent(metadataURI)`
- `getAgent(agentId)`
- `updateReputation(agentId, decision, reasonCode)`
- `setActionAttestation(address)`

Only the configured `ActionAttestation` contract should update reputation.

## PolicyRegistry

Purpose:

- define what an agent is allowed to do;
- store compact enforceable rules;
- expose target and selector allowlists.

Policy fields:

- `owner`
- `agentId`
- `maxNativeValue`
- `maxSlippageBps`
- `active`

Current version: `1.2.0`.

`maxSlippageBps` is capped at `10000`, because basis points above 100% are configuration errors.

Permission sets:

- allowed target contracts;
- allowed function selectors.

Core writes:

- `createPolicy(agentId, maxNativeValue, maxSlippageBps, targets, selectors)`
- `updatePolicy(policyId, maxNativeValue, maxSlippageBps, active)`
- `setTargetAllowed(policyId, target, allowed)`
- `setSelectorAllowed(policyId, selector, allowed)`

Only the policy owner can update policy configuration.

## ActionAttestation

Purpose:

- record every firewall decision;
- emit auditable `ActionChecked` events;
- update agent counters.

Recorded fields:

- `agentId`
- `policyId`
- `target`
- `value`
- `selector`
- `calldataHash`
- `simulationHash`
- `decision`
- `reasonCode`
- `timestamp`

Important behavior:

- `ALLOW` is rejected when target, selector or value violate on-chain policy.
- `ALLOW` must use `POLICY_PASSED`.
- `BLOCK` and `REVIEW` cannot use `POLICY_PASSED`.
- `BLOCK` can still be recorded for violations, because blocked records are evidence.

## TestStrategyVault

Purpose:

- provide a real testnet target for guarded agent deposits;
- hold native test MNT and issue one test share per wei deposited;
- make benchmark/policy-pack demos prove state change without using fake balances.

Core reads/writes:

- `depositFor(receiver)` payable
- `withdraw(shares, receiver)`
- `previewDeposit(assets)`
- `totalAssets()`
- `sharesOf(account)`

Important behavior:

- this is an Interlock-owned test contract, not a production yield vault;
- withdrawal is intentionally minimal and exists only so testnet deposits are not permanently locked;
- it should never be marketed as a real RWA, DeFi, or yield integration;
- real protocol integrations must replace it with verified Mantle ecosystem addresses.

## TestStrategyRouter

Purpose:

- model a Mantle DeFi/RWA-style action where an agent routes a native deposit into an approved test vault;
- give Interlock a concrete action selector for `AI Trading`, `AI x RWA`, and `Agentic Wallets` demos.

Core reads/writes:

- `routeNativeDeposit(vault, receiver, maxSlippageBps)` payable
- `quoteNativeDeposit(vault, value)`
- `MAX_TEST_SLIPPAGE_BPS()`

Important behavior:

- rejects zero vault, zero receiver, zero value, and slippage above `1000` bps;
- produces real vault state changes when the firewall allows the action and the wallet sends it;
- remains a test-contract integration, not a live trading or RWA protocol.

## Deployment Order

1. Deploy `AgentRegistry`.
2. Deploy `PolicyRegistry`.
3. Deploy `ActionAttestation` with registry addresses.
4. Call `AgentRegistry.setActionAttestation(actionAttestation)`.
5. Optional: set `DEPLOY_TEST_STRATEGY_CONTRACTS=true` to deploy `TestStrategyVault` and `TestStrategyRouter`.
6. Update `packages/shared/src/addresses.ts`.
7. Update `.env.example`, deployment manifest, dashboard env, and docs.

## Production Notes

Current contracts are suitable for dev alpha. Before mainnet:

- add authorized recorders;
- add emergency pause;
- add policy time windows;
- add EIP-712 signed receipts;
- add fuzz/static analysis;
- run external review.
