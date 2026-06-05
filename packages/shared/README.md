# @interlock/shared

Shared chain configuration, deployed addresses, ABIs, and constants for Interlock Firewall.

```ts
import { deployedAddresses, mantleSepolia, actionAttestationAbi } from "@interlock/shared";

console.log(mantleSepolia.id); // 5003
console.log(deployedAddresses.mantleSepolia.actionAttestation);
console.log(actionAttestationAbi.length);
```

## Exports

- Mantle Sepolia chain config.
- Current Interlock Firewall deployed contract addresses.
- Contract ABIs for `AgentRegistry`, `PolicyRegistry`, and `ActionAttestation`.
- Helper constants shared by SDK, CLI, indexer, examples, and dashboard.

## Dev Alpha Scope

Addresses in this package point to the current Mantle Sepolia Dev Alpha deployment. Treat them as testnet infrastructure, not audited mainnet endpoints.
