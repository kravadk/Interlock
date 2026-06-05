# @interlock/contracts

Solidity contracts for the Interlock pre-flight firewall on **Mantle Sepolia**. Dependency-free
(solc 0.8.30, no OpenZeppelin); EIP-712 domain separator, type hash, and `ecrecover` are hand-rolled.

## Contracts

| Contract | Purpose |
| --- | --- |
| `AgentRegistry` | Agent identity + reputation counters (updated by the attestation contract). |
| `PolicyRegistry` | On-chain policies: max native value, max slippage, target + selector allowlists. |
| `ActionAttestationV3` | **Current.** V2 + an `evidenceHash` commitment (in the signed payload + event) and an extended `ReasonCode` set (RWA/concentration/daily-rebalance/stale-policy/wrong-chain). |
| `ActionAttestationV2` | Deprecated. Records firewall decisions as **attestor-signed** evidence with a **dispute window**. |
| `TestStrategyVault` / `TestStrategyRouter` | Optional test targets for allowlisted ALLOW demos. |

### ActionAttestationV3 — the security model

`recordAction(...args, evidenceHash, deadline, signature)` is **record-immediately + challenge window**:

- The off-chain firewall signs each decision (EIP-712, `ACTION_TYPEHASH` over agentId, policyId,
  target, value, calldataHash, selector, simulationHash, **evidenceHash**, decision, reasonCode, nonce,
  deadline; domain version `"3"`). `recordAction` recovers the signer and requires it to equal the
  authorized `attestor` — so the recorded decision is provably the evaluated one, not arbitrary.
  Per-agent `nonces` prevent replay; expired `deadline` reverts.
- `evidenceHash` is a keccak256 commitment to the off-chain evidence object, so the attestor commits to
  the exact evidence behind a decision. The `ReasonCode` enum is extended with advisory risk codes
  (RWA_OVEREXPOSURE, CONCENTRATION_RISK, DAILY_REBALANCE_EXCEEDED, STALE_POLICY, WRONG_CHAIN) — order
  mirrors `@interlock/shared`.
- Each record stores `status` (ACTIVE → CHALLENGED / FINALIZED) and
  `finalizableAt = block.timestamp + DISPUTE_WINDOW`. `challenge(actionCheckId, reason)` flags it
  within the window; `finalize(actionCheckId)` stamps FINALIZED after it. No keeper required.
- The `ActionChecked` event is **append-only** (`status`/`finalizableAt`/`evidenceHash` trail the
  original fields), so older parsers keep decoding.

V3 ships as a non-destructive upgrade via `scripts/deploy-v3.ts`: it deploys only the new attestation
contract against the existing registries, then `AgentRegistry.setActionAttestation(v3)` — preserving
all prior agents, policies, and history.

## Commands

```bash
pnpm --filter @interlock/contracts compile   # solc (viaIR) → artifacts/*.json
pnpm --filter @interlock/contracts test      # vitest + ganache
PRIVATE_KEY=0x... pnpm --filter @interlock/contracts deploy:mantle-sepolia
```

Deploy writes `deployments/mantle-sepolia/latest.json` + `latest.env` and updates
`packages/shared/src/addresses.ts`. `ATTESTOR_ADDRESS` (defaults to the deployer) is set as the
on-chain attestor; redeploying re-points reputation via `AgentRegistry.setActionAttestation(v2)`.

> Dev Alpha — testnet only. Not audited; do not use with mainnet value.
