# Contract Audit Readiness

Interlock Control Plane is still **Mantle Sepolia Dev Alpha**. This document does not claim the contracts are audited or mainnet-ready. It records the current evidence package that an external reviewer would need before a real audit.

## Current Scope

Core contracts included in the audit-readiness gate:

- `AgentRegistry`
- `PolicyRegistry`
- `ActionAttestation`
- `ActionAttestationV2`
- `PolicyGuardedExecutor`
- `DisputeEscrow`
- `AttestorCommittee`
- `ReputationOracle`

Demo/test strategy contracts are also compiled and covered by Slither configuration, but they are not production security primitives:

- `TestStrategyVault`
- `TestStrategyRouter`

## Security Model Summary

The product protects the narrow path:

```text
agent proposes action
  -> policy + simulation checks
  -> allow/block decision
  -> signed pre-flight attestation
  -> indexed evidence and reputation counters
```

It does not protect against unsafe policy choices, malicious allowlisted protocols, compromised private keys, malicious RPC responses, MEV, or every protocol-specific calldata risk.

## Threat To Mitigation Matrix

| Threat | Current mitigation | Evidence |
| --- | --- | --- |
| Agent tries unknown target | Target allowlist in `PolicyRegistry`; `ALLOW` reverts when target is not allowed | `contracts.test.ts`, `policy-guarded-executor.test.ts`, `policy-guarded-executor.invariant.test.ts` |
| Agent tries unknown selector | Selector allowlist in `PolicyRegistry`; `ALLOW` reverts when selector is not allowed | `contracts.test.ts`, `policy-guarded-executor.test.ts`, `policy-guarded-executor.invariant.test.ts` |
| Agent tries to exceed native value limit | `PolicyRegistry.maxNativeValue`; attestation and executor enforce value limit | `contracts.test.ts`, `policy-guarded-executor.test.ts` |
| Recorder forges an arbitrary V2 decision | `ActionAttestationV2` requires an EIP-712 signature from the configured attestor | `action-attestation-v2.test.ts` |
| Recorder replays a prior signed decision | `ActionAttestationV2.nonces(agentId)` is included in the signed payload | `action-attestation-v2.test.ts` |
| Recorder uses expired signature | Signed `deadline` is checked on-chain | `action-attestation-v2.test.ts` |
| Invalid decision/reason combinations | `ALLOW` only with `POLICY_PASSED`; `BLOCK`/`REVIEW` cannot use `POLICY_PASSED` | `contracts.test.ts`, `action-attestation-v2.test.ts` |
| Incorrect reputation score | `ReputationOracle` computes a bounded score from registry counters | `reputation-and-committee.test.ts`, `reputation-oracle.invariant.test.ts` |
| Dispute bond accounting error | `DisputeEscrow` uses pull payments and tested value-conservation invariants | `dispute-escrow.test.ts`, `dispute-escrow.invariant.test.ts` |
| Committee duplicate signer counted twice | `AttestorCommittee` requires distinct recovered signers | `reputation-and-committee.test.ts` |

## Automated Evidence

Run from the repository root:

```bash
pnpm --filter @interlock/contracts check
pnpm --filter @interlock/contracts test
pnpm --filter @interlock/contracts lint:sol
pnpm security:slither
```

Current contract test suite:

- 8 test files.
- 29 tests.
- Property/invariant tests for `DisputeEscrow`, `PolicyGuardedExecutor`, and `ReputationOracle`.
- `compile` emits ABI, bytecode, `userdoc`, and `devdoc`.
- `audit:docs` fails if core contract artifacts are missing NatSpec docs objects.

`lint:sol` currently runs Solhint in warning mode. Warnings are useful audit hygiene signals, not proof of a vulnerability. The next cleanup pass should either resolve high-value NatSpec/gas warnings or tune the rules to keep CI output actionable.

## Static Analysis Coverage

`scripts/slither-check.mjs` is configured for:

- `AgentRegistry.sol`
- `PolicyRegistry.sol`
- `ActionAttestation.sol`
- `ActionAttestationV2.sol`
- `PolicyGuardedExecutor.sol`
- `DisputeEscrow.sol`
- `AttestorCommittee.sol`
- `ReputationOracle.sol`
- `TestStrategyVault.sol`
- `TestStrategyRouter.sol`

The GitHub Actions Slither step is gated by `RUN_SLITHER=true` because Slither requires a Python/solc toolchain that is heavier than the default CI path. Before any mainnet claim, run it locally or in a dedicated CI job and attach reports from `reports/slither-*.json`.

Accepted Slither suppressions:

- `ActionAttestationV2` uses `timestamp` checks for signature expiry and the dispute window.
- `ActionAttestationV2` uses inline `assembly` only inside dependency-free ECDSA signature recovery.
- `ActionAttestationV2.DOMAIN_SEPARATOR` intentionally uses constant-style naming.
- `PolicyGuardedExecutor` uses a low-level call because its explicit purpose is to forward allowlisted calldata after policy checks.
- `DisputeEscrow` uses timestamp checks for the dispute window and a low-level call for pull-payment withdrawal after state is cleared under a reentrancy lock.
- `AttestorCommittee` uses inline `assembly` only inside dependency-free ECDSA signature recovery.

## Manual Review Checklist

Review these areas before mainnet:

- EIP-712 domain and nonce behavior after redeploys or chain forks.
- `setAttestor` operational risk and key rotation flow.
- Whether single-attestor mode is acceptable, or whether `AttestorCommittee` must be wired into the live record path.
- Whether reputation should update immediately or only after the dispute window finalizes.
- Whether `DisputeEscrow` should be integrated directly into `ActionAttestationV2` instead of remaining decoupled.
- Policy owner risk: unsafe allowlists and overly high limits.
- ERC-20 `approve` spender-level checks.
- Protocol-specific invariant packs for real Mantle integrations.
- RPC/simulation trust assumptions.
- Event/indexer assumptions for public dashboards.

## Mainnet Gate

Do not deploy or market Interlock as mainnet security until all of the following are done:

- `pnpm check`, `pnpm test`, `pnpm smoke:all`, `pnpm security:adversarial`, and `pnpm security:slither` pass.
- Slither results are reviewed and documented.
- Mythril or another symbolic/manual review pass is documented.
- Contracts are source-verified on the target explorer.
- Threat model and limitations are updated for the exact deployment.
- External security review is complete.
- Incident response and key-rotation process is tested.
- UI and docs clearly say what the product does and does not guarantee.
