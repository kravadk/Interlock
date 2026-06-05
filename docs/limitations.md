# Limitations

Interlock Firewall is a pre-flight policy and attestation layer. It is not a complete security system.

## Current MVP Limitations

- No full account abstraction wallet.
- No Safe/ERC-7579 module yet.
- `ActionAttestationV3` has EIP-712 attestor-signed decision receipts plus `evidenceHash`, but the model is still Dev Alpha and single-attestor by default.
- No authorized recorder model yet.
- No policy time windows yet.
- No production audit.
- No ZK reputation.
- No multichain support by default.
- No real-time scam database.
- No guarantee that simulation state matches future execution state.

## Contract Limitations

The current `ActionAttestationV3` enforces basic decision sanity checks:

- policy active;
- policy matches agent;
- target allowed;
- selector allowed;
- value within max native limit.
- `ALLOW` must use `POLICY_PASSED`;
- `BLOCK` and `REVIEW` cannot use `POLICY_PASSED`.

It does not yet enforce:

- per-window spend;
- action expiry;
- multi-attestor quorum in the live recording path;
- decoded ERC-20 approval spender checks;
- protocol-specific invariant checks.

## SDK Limitations

The SDK checks:

- target;
- selector;
- value;
- expected slippage metadata;
- simulation success/failure.

It does not fully decode every protocol-specific calldata payload.

## Dashboard Limitations

The dashboard is a developer console, not a custody wallet.

It should not be treated as:

- a production wallet;
- an audit report;
- a hosted security service;
- a replacement for protocol due diligence.

## Mainnet Warning

Do not use this with meaningful mainnet funds until:

- contracts are reviewed;
- recorder model is hardened;
- policy time windows exist;
- EIP-712 receipts exist;
- deployment is verified;
- limitations are accepted by integrators.
