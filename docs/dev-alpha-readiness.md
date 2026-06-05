# Dev Alpha Readiness

Interlock Firewall is currently scoped as a Mantle Sepolia developer alpha. It is ready for developers to evaluate the preflight safety flow, integrate the SDK in test environments, and inspect on-chain attestations.

It is not a production security product yet. Do not market it as audited, mainnet-ready, or sufficient to protect real funds.

## Ready Now

- Mantle Sepolia contracts and deployment manifest.
- SDK for policy reads, preflight checks, attestation writes, guarded sends, policy packs, and history reads.
- CLI for setup, preflight, recording, policy management, history, and doctor checks.
- Indexer API for agents, policies, actions, stats, and sync.
- Dashboard developer console with live indexer data and Mantle RPC preflight checks.
- Examples for raw Viem, backend automation, agent framework wrappers, and REST preflight.
- Smoke tests for packages, examples, web, deployment manifests, docs, and live flows.

## Alpha Safety Boundary

Interlock Firewall reduces agent execution risk by checking target, selector, value, slippage, policy activity, and RPC simulation before execution. It does not prove that an allowlisted protocol is safe, that calldata has no hidden protocol-specific effects, or that simple reputation counters are production-grade identity.

## Before Public Beta

- Publish package artifacts or npm packages.
- Host docs and a read-only dashboard.
- Add signed decision receipt design and implementation.
- Add recorder permissions.
- Expand REST API docs and examples.
- Add more adversarial tests.

## Before Production

- Add EIP-712 decision signatures, expiry, replay protection, and stricter attestation rules.
- Add emergency policy controls and ownership transfer flows.
- Add static analysis, fuzz/property tests, and an external audit.
- Add hosted indexer/API monitoring and rate-limit handling.
- Do not deploy to mainnet before review.
