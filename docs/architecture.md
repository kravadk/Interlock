# Interlock Architecture

Interlock is a Mantle-native **pre-flight firewall** for autonomous AI agents: a safety, evidence,
enforcement, and reputation layer that runs before `sendTransaction`.

## Naming Compatibility

The public product name is **Interlock** and npm packages use the `@interlock/*` scope. Some deployed
contract paths still use the legacy `AgentOps` name in EIP-712 domains, tests, and verification
artifacts. Those names are kept for deployed bytecode and signature compatibility and should not be
changed without a coordinated redeploy.

## Core Pipeline

```text
AI Agent
  -> proposes AgentAction
  -> SDK reads PolicyRegistry + simulates the tx (eth_call)
  -> SDK returns a deterministic ALLOW / BLOCK (+ reason code)
  -> advisory AI risk layer explains + scores the decision (never overrides it)
  -> attestor signs the decision (EIP-712); ActionAttestationV3 records it with a dispute window and evidenceHash
  -> AgentRegistry updates reputation counters
  -> (optional) the agent routes execution through PolicyGuardedExecutor — disallowed actions revert on-chain
  -> Indexer/RPC recorder reads events -> Dashboard, Agent Safety Card, SDK/REST/MCP/CLI consume evidence
```

The product is centered on one loop, now **enforceable and economically secured** on-chain:

```text
action -> check -> decision -> signed evidence -> (enforce / dispute) -> reputation
```

## On-Chain Components

### AgentRegistry

Stores agent identity and simple behavior counters:

- owner
- metadata URI
- allowed action count
- blocked action count
- failed simulation count

This is intentionally not a full ERC-8004 implementation in MVP. It is shaped so later reputation or validation events can be mapped to ERC-8004-style registries.

### PolicyRegistry

Stores the policy owned by an agent owner:

- max native spend per action
- max slippage bps
- allowed targets
- allowed selectors
- active flag

Policies are intentionally small. MVP does not implement a natural-language policy language.

### ActionAttestationV3

The on-chain flight recorder. Records every firewall decision (agent id, policy id, target, value,
calldata hash, selector, simulation hash, decision, reason code, timestamp) and adds two guarantees
over V1:

1. **Attestor-signed (EIP-712).** Each decision is signed off-chain by an authorized attestor;
   `recordAction` recovers the signer and requires it to equal the on-chain `attestor`, so a recorded
   `ALLOW`/`BLOCK` is provably the *evaluated* decision, not arbitrary. Per-agent `nonces` prevent
   replay; a `deadline` prevents stale signatures.
2. **Dispute window.** Each record carries `status` (ACTIVE → CHALLENGED / FINALIZED) and
   `finalizableAt = block.timestamp + DISPUTE_WINDOW` (2h). `challenge(actionCheckId, reason)` flags
   it within the window; `finalize(actionCheckId)` stamps it after. The `ActionChecked` event is
   append-only (new fields trail the originals) so older parsers keep decoding.

It still performs the V1 `ALLOW` sanity checks (policy active, agent match, caller owns the policy,
target/selector allowlisted, value ≤ `maxNativeValue`) and updates `AgentRegistry` reputation. `BLOCK`
decisions are recorded for disallowed targets/values too — that record is the evidence the firewall
stopped a risky action.

## On-Chain Enforcement, Economics, and Decentralization

These four contracts are **additive and standalone** (keyed by `actionCheckId`/`agentId`/`policyId`,
no V2 redeploy):

- **PolicyGuardedExecutor** — agents route execution *through* `execute(...)`, which validates against
  the on-chain policy and **reverts a disallowed action before it runs**, forwarding allowed ones.
  Turns advisory recording into real enforcement. `previewExecute(...)` is an authoritative dry-run.
- **DisputeEscrow** — two-sided bonds + slashing: a recorder bonds a record's honesty, a challenger
  bonds a dispute, an arbiter resolves, and the winner takes both bonds (pull-payment `withdraw`).
- **AttestorCommittee** — `isApproved(digest, signatures[])` requires ≥ `threshold` distinct committee
  signatures; a reusable m-of-n decentralized-attestation primitive.
- **ReputationOracle** — `getScore(agentId) → (scoreBps, tier)` + `meetsThreshold(...)`, derived from
  AgentRegistry counters, so third-party contracts can gate on an agent's Interlock reputation.

## Off-Chain Components

### SDK

The SDK is the dev integration point. It:

- loads policy;
- extracts calldata selector;
- simulates the proposed transaction;
- evaluates target/value/slippage/selector rules;
- returns a typed decision;
- optionally writes an attestation transaction;
- exposes the on-chain follow-ons: `executeThroughGuard`, `bondRecord`/`openDispute`/`resolveDispute`,
  `committeeApproved`, `getReputation`.

### AI Layer (advisory)

A server-side route (`/api/ai`, key never exposed to the browser) powers, via Claude tool-use with
validated structured output: a per-decision **risk explainer** (plain language + 0–100 score),
**NL → policy** drafting, and a **block-pattern summary**. It is strictly **advisory** — it never
drives `ALLOW`/`BLOCK` and never enters the on-chain attestation, so the deterministic firewall stays
the sole source of truth. Every AI feature degrades gracefully (the route returns `503`) when no key
is configured.

### Dashboard

The dashboard is a developer console:

- agent profile;
- policy editor concept;
- action review;
- flight recorder;
- Benchmark Arena;
- Agent Safety Card;
- SDK/REST/MCP/CLI snippets;
- Mantle ecosystem policy packs.

### MCP Server

The MCP server exposes Interlock tools to IDE agents and LLM runtimes:

- pre-flight;
- record decision;
- get policy;
- get agent history;
- explain block reason;
- create policy draft.

This is the agent-native integration path.

### Benchmark Arena

Benchmark Arena runs repeatable pre-flight scenarios against the selected real agent/policy:

- safe agent profile read;
- unknown target attack;
- overspend attempt;
- high slippage attempt;
- unapproved approve selector;
- selector-only calldata simulation failure;
- empty calldata selector check.

It produces a V2 Dev Alpha evidence score with category, track, ecosystem, reason-code coverage, and remediation. It is not a production trust score.

### Demo Agent

The CLI agent runner uses the deployed Mantle Sepolia contracts and a real allowlisted target selector.

## Security Boundaries

MVP protects against:

- unknown target calls;
- overspend attempts;
- unknown function selectors;
- failed simulation;
- excessive expected slippage.

The SDK performs the full policy evaluation, including selector, slippage and simulation checks. The contract enforces additional target/selector/value checks for `ALLOW` attestations so a policy owner cannot write a clean on-chain `ALLOW` record for an obviously disallowed call or overspend.

MVP does not protect against:

- protocol-level exploits in allowlisted contracts;
- malicious oracle data;
- owner removing policy;
- all hidden value movements;
- production wallet drainers.

## Shipped since the MVP

EIP-712 signed receipts, dispute window, on-chain enforcement (PolicyGuardedExecutor), dispute
economics (DisputeEscrow), m-of-n attestation primitive (AttestorCommittee), reputation primitive
(ReputationOracle), advisory AI layer, and observability (metrics/health/logs).

## Future Roadmap

- Wire AttestorCommittee into the recording path (ActionAttestation V3) for true m-of-n on-chain.
- Time-decay + per-policy weighting in ReputationOracle; ERC-4337/ERC-7579 enforcement variant.
- ERC-8004 validation registry integration.
- ERC-7579 hook version for smart accounts.
- Wallet adapters for AgentKit/GOAT.
- Signed decision receipts.
- Public hosted recorder.
- x402 payment action policy pack.
- RWA/DeFi policy presets.
