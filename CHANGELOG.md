# Changelog

## 0.1.0 - Mantle Sepolia Dev Alpha

Initial developer alpha for Interlock Firewall.

### Added

- Mantle Sepolia contracts for agent identity, policy registry, and action attestations.
- TypeScript SDK with Viem-based pre-flight checks, simulation, policy evaluation, and on-chain decision recording.
- Calldata helpers so integrations can pass complete calldata without duplicating UI-specific logic.
- CLI for doctor checks, agent reads, policy reads, policy packs, preflight, record, and history flows.
- SQLite-backed indexer and HTTP read API for agents, policies, and action history.
- Next.js developer console with Agent Profile, Policy Editor, Action Review, Policy Checks, Flight Recorder, and Developer Integration sections.
- REST preflight API reference server for backend agents.
- Package smoke, consumer smoke, examples smoke, web smoke, live smoke, and docs link checks.
- Developer docs for REST API, common mistakes, dashboard behavior, Dev Alpha readiness, and signed decision receipt design.

### Security Notes

- This is a Mantle Sepolia developer alpha, not a production custody or mainnet security product.
- Reputation is currently simple counters.
- Production use requires signed decision receipts, replay protection, authorized recorder rules, stricter attestation semantics, monitoring, and security review.
