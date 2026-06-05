# Simulation

Simulation is the first line of defense before a policy decision is recorded.

## Current MVP Simulation

The SDK uses Viem/RPC calls to dry-run the proposed transaction where possible.

Flow:

```text
load policy
  -> extract selector
  -> check target/value/slippage
  -> simulate transaction
  -> compute hashes
  -> return decision
```

## Simulation Hash

`simulationHash` is stored on-chain as a compact reference to the off-chain result.

The full trace stays off-chain because it can be large and RPC/provider-specific.

## What Simulation Catches

- transaction revert;
- wrong calldata for target;
- missing payable path;
- obvious execution failure.

## What Simulation Does Not Guarantee

- future state will match simulation state;
- allowlisted protocol is safe;
- MEV/slippage will not happen;
- RPC is honest;
- token callbacks or hidden transfer behavior are always visible.

## Production Simulator Interface

Target interface:

```ts
interface TransactionSimulator {
  simulate(action: AgentAction): Promise<SimulationResult>;
}
```

Planned adapters:

- `ViemCallSimulator`
- `TenderlySimulator`
- deterministic simulator fixtures

## Recommended Production Rules

Before sending a transaction:

- simulation must be fresh;
- chain ID must match the attestation chain;
- calldata hash must match;
- target and selector must still be allowed;
- action must be recorded with a deadline or nonce in future versions.
