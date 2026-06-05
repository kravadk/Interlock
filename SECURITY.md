# Security Policy

Interlock Firewall is experimental developer infrastructure for AI-agent transaction policy checks and attestations. It is not a complete wallet security product and should not be treated as a substitute for audits, secure key management, or protocol-level risk review.

## Supported Versions

| Version | Status |
| --- | --- |
| `0.1.x` | Experimental MVP |

## Reporting Security Issues

Until a public repository and disclosure inbox are configured, report issues privately to the project maintainers through the team channel used for this hackathon. Do not publish exploit details before maintainers have had time to assess impact and prepare a fix.

Please include:

- affected package or contract;
- steps to reproduce;
- expected impact;
- suggested fix if available;
- whether funds or private keys could be affected.

## Known Limitations

The current MVP does not protect against:

- exploits in allowlisted contracts;
- malicious or compromised policy owners;
- policy owners recording truthful `BLOCK` records for risky attempts they created themselves;
- malicious RPC responses;
- all approval and delegated-call edge cases;
- MEV or all slippage outcomes;
- prompt injection outside the transaction-policy boundary;
- production wallet-drainer detection.

## Production Requirements Before Mainnet

Before any mainnet use, the project needs:

- full contract test coverage;
- `pnpm security:adversarial` passing in CI;
- Slither via `pnpm security:slither` and a documented Mythril/manual review pass;
- fuzzing for policy limits;
- selector/call-data invariant tests for every policy pack;
- stronger authorized recorder or signed decision receipts;
- external security review;
- verified contracts;
- documented incident response process;
- explicit risk disclosures in docs and UI.

## Secret Handling

- Sensitive keys are **server-side / environment only** and never shipped to the browser:
  `PRIVATE_KEY` (deployer + agent-demo), `ATTESTOR_PRIVATE_KEY` (`/api/attest` signing),
  `ANTHROPIC_API_KEY` (`/api/ai`). Each route returns **503** when its key is unset — never a leak.
- `/api/health` exposes key **presence booleans only**, never values.
- `.env` / `.env.local` are gitignored; only `.env.example` (empty placeholders) is committed.
- Run `pnpm security:secrets` (`scripts/secret-scan.mjs`) locally and in CI to scan the tree for
  populated private keys, Anthropic/AWS keys, and PEM blocks.

## Key Rotation Runbook

The deployer key is also the on-chain **attestor** and policy owner. To rotate it:

1. **Generate** a new key and fund it with testnet MNT from the
   [Sepolia faucet](https://faucet.sepolia.mantle.xyz/).
2. **Re-point the attestor** without redeploying: as the current owner call
   `ActionAttestationV2.setAttestor(newAddress)` (one tx). To also rotate the deployer/owner,
   redeploy with `PRIVATE_KEY=<new>` + `ATTESTOR_ADDRESS=<new>` (`pnpm deploy:mantle-sepolia`), which
   re-points reputation via `AgentRegistry.setActionAttestation(v2)`.
3. **Update env** everywhere the old key lived: local `.env`, the Vercel project env, and the
   indexer host env.
4. **Verify**: `pnpm cli doctor --no-fail` + `pnpm live:services`; confirm a fresh `/api/demo/run`
   records with the new attestor.
5. **Retire** the old key from all envs — it can no longer sign valid attestations once `setAttestor`
   has moved on.

See [docs/ship-runbook.md](docs/ship-runbook.md) for deployment and
[docs/observability.md](docs/observability.md) for monitoring.
