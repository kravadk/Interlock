# Interlock Firewall Final Product Plan

This document describes Interlock Firewall as a developer product, not only as a hackathon demo.

## 1. Product Definition

**Interlock Firewall** is a Mantle-native pre-flight security middleware for autonomous AI agents.

It sits between an AI agent and wallet execution:

```text
AI agent -> proposed transaction -> Interlock Firewall -> allow/block -> on-chain attestation -> reputation
```

The product promise:

> A developer can let an AI agent propose on-chain actions without letting that agent execute unsafe transactions without policy checks, simulation, and an audit trail.

This is not a wallet, trading bot, universal scanner, or RWA platform. The core product is a reusable safety layer before `sendTransaction`.

The clearest mental model is GitLab CI/CD for agent transactions:

| GitLab workflow | Interlock workflow |
| --- | --- |
| Merge request | Agent-proposed transaction |
| CI pipeline | Validation, simulation, and policy checks |
| Protected branch | Policy boundary |
| Merge approval | `ALLOW` decision |
| Failed pipeline | `BLOCK` decision |
| Audit log | On-chain `ActionChecked` history |

Read [Product Logic](product-logic.md) for the full final user flow and dashboard behavior.

## 2. Final Product Shape

The finished product has six parts:

1. **Smart contracts**
   - `AgentRegistry`
   - `PolicyRegistry`
   - `ActionAttestationV3`
   - `PolicyGuardedExecutor`
   - `DisputeEscrow`
   - `AttestorCommittee`
   - `ReputationOracle`
   - Dev Alpha reputation counters and oracle scoring
   - Mantle Sepolia deployment manifest and live smoke flow

2. **TypeScript SDK**
   - `checkAction`
   - `recordDecision`
   - `guardedSendTransaction`
   - `getActionHistory`
   - policy pack audit/apply
   - Viem and agent-runtime adapters

3. **Simulation and policy engine**
   - target allowlist check
   - selector allowlist check
   - native value limit
   - slippage limit
   - policy active state
   - RPC simulation result

4. **Indexer/API**
   - syncs contract events
   - exposes agents, policies, actions, and stats
   - powers the dashboard Flight Recorder

5. **Developer dashboard**
   - policy maintenance
   - action review
   - agent stats
   - on-chain action history
   - SDK snippets and contract addresses

6. **Docs and examples**
   - raw Viem integration
   - agent framework adapter
   - GOAT-style adapter
   - AgentKit-style adapter
   - Vercel AI SDK-style adapter
   - LangChain-style adapter
   - backend automation
   - preflight API route
   - deployment guide
   - threat model
   - demo runbook

## 3. Developer Flow

A developer has an AI agent that can produce transaction intent:

```text
LLM or strategy engine -> tool call -> proposed tx
```

Before execution, the app calls Interlock Firewall:

```ts
const decision = await firewall.checkAction({
  agentId,
  policyId,
  tx: {
    to,
    value,
    data,
  },
  metadata: {
    intent: "Deposit into approved vault",
    expectedSlippageBps: 40,
  },
});

if (!decision.allowed) {
  return { blocked: true, reason: decision.reasonCode };
}

const executionTxHash = await walletClient.sendTransaction(decision.tx);
await firewall.recordDecision(decision);
```

The developer receives a structured decision:

```ts
{
  allowed: false,
  decision: "BLOCK",
  reasonCode: "VALUE_LIMIT_EXCEEDED",
  riskScore: 90,
  explanation: "Native value exceeds policy max spend limit.",
  checks: {
    targetAllowed: true,
    selectorAllowed: true,
    valueWithinLimit: false,
    slippageWithinLimit: true,
    policyActive: true
  }
}
```

## 4. Why Developers Use It

Teams building agent wallets, DeFi agents, RWA agents, or payment agents normally need to implement these controls themselves:

- limit how much an agent can spend;
- restrict target contracts;
- restrict function selectors;
- simulate a transaction before execution;
- explain why a transaction was blocked;
- record the decision for users, auditors, or judges;
- show agent behavior history in a dashboard.

Interlock Firewall turns that repeated work into one SDK and on-chain audit layer.

## 5. Runtime Flow

```text
1. Developer registers agent
2. Developer creates policy
3. Agent proposes action
4. SDK loads policy
5. SDK simulates transaction
6. Policy engine checks action
7. Firewall returns ALLOW or BLOCK
8. App executes only allowed transactions
9. Firewall records decision on-chain
10. Indexer syncs event
11. Dashboard shows Flight Recorder history
12. Agent reputation counters update
```

## 6. On-Chain And Off-Chain Split

On-chain:

- agent identity;
- policy ownership;
- compact policy rules;
- allow/block decision;
- reason code;
- calldata hash;
- simulation hash;
- reputation counters.

Off-chain:

- full simulation trace;
- LLM prompt/tool context;
- rich risk report JSON;
- dashboard cache;
- indexer database.

The chain is used for verifiable accountability, not for storing full logs.

## 7. Current Implementation Status

Implemented:

- Solidity contract package;
- TypeScript SDK;
- CLI;
- SQLite-backed indexer and HTTP API;
- Next.js developer dashboard;
- policy packs and policy pack schema;
- Mantle Sepolia deployment manifest and live smoke;
- SDK calldata helpers for known Interlock actions;
- raw Viem example;
- agent framework adapter example;
- GOAT-style adapter example;
- AgentKit-style adapter example;
- Vercel AI SDK-style adapter example;
- LangChain-style adapter example;
- backend automation example;
- preflight API example and REST server mode;
- MCP server;
- hosted docs and changelog routes;
- release packaging and Changesets release-check workflow;
- EIP-712 attestor-signed decision receipts with nonce/deadline checks;
- dispute and finalize flow;
- on-chain guarded executor, dispute escrow, attestor committee, and reputation oracle primitives;
- local contract smoke test;
- package smoke, consumer smoke, web smoke, docs link check;
- submission doctor and generated submission bundle.

Remaining external or production-only items:

- final public dashboard URL controlled by the submitting team;
- public npm package publishing;
- production authorized-recorder or multi-attestor operations model;
- production security review.

## 8. Smart Contract Target State

### AgentRegistry

Current role:

- register agents;
- store owner and metadata URI;
- store reputation counters;
- emit agent events.

Production improvements:

- metadata update;
- ownership transfer;
- agent active/deactivated state;
- authorized recorder model.

### PolicyRegistry

Current role:

- create policy;
- update max native value, slippage, active state;
- allow/deny targets;
- allow/deny selectors;
- enumerate allowlists.

Production improvements:

- time-window spend limits;
- policy metadata hash;
- recorder allowlist;
- emergency deactivation pattern.

### ActionAttestation

Current role:

- record `ALLOW` and `BLOCK` decisions;
- require attestor-signed EIP-712 decisions;
- reject replayed or expired records through nonce/deadline checks;
- expose ACTIVE / CHALLENGED / FINALIZED status;
- reject invalid `ALLOW` records that violate policy;
- update agent counters;
- emit `ActionChecked`.

Production improvements:

- execution result recording;
- production multi-attestor or authorized-recorder operations;
- monitoring and incident response runbooks;
- external audit before mainnet claims.

## 9. SDK Target State

Core API:

```ts
firewall.registerAgent()
firewall.createPolicy()
firewall.checkAction()
firewall.recordDecision()
firewall.guardedSendTransaction()
firewall.getActionHistory()
firewall.getAgentStats()
firewall.auditPolicyPack()
firewall.applyPolicyPack()
```

Adapter API:

```ts
createGuardedViemWallet()
createAgentFirewallTool()
createFirewallActionHandler()
withInterlockFirewall()
```

The SDK is the primary product surface. The dashboard and CLI exist to make the SDK easier to understand, test, and operate.

## 10. Dashboard Target State

The dashboard should stay a developer console, not a marketing page.

Core screens:

- Agent profile and counters;
- Policy Editor;
- Action review;
- Flight Recorder;
- Developer integration snippets;
- Contract/deployment status.

It should help a judge or integrating developer answer one question quickly:

> What did the agent try to do, why was it allowed or blocked, and where is the on-chain proof?

## 11. Indexer/API Target State

Current API goal:

```text
GET /health
POST /sync
GET /agents
GET /agents/:id
GET /agents/:id/actions
GET /policies
GET /policies/:id
GET /actions
GET /stats/agents/:id
```

Production improvements:

- pagination;
- more filters;
- hosted Postgres option;
- deployment block UX;
- better error reporting in the dashboard.

## 12. Integration Examples

Current examples:

- `examples/raw-viem`: direct SDK integration.
- `examples/agent-framework`: plan/execute tool wrapper.
- `examples/goat-adapter`: GOAT-style tool boundary.
- `examples/agentkit-adapter`: AgentKit-style action provider boundary.
- `examples/vercel-ai-adapter`: Vercel AI SDK-style tool wrapper.
- `examples/langchain-adapter`: LangChain-style structured tool wrapper.
- `examples/backend-automation`: worker or cron-style agent.
- `examples/preflight-api`: API route handler for agent-proposed JSON.

Current integration priority is Viem + REST + MCP. Framework adapters are dependency-light examples, not forced runtime dependencies.

## 13. Security Requirements Before Production

Before making production safety claims:

- harden authorized recorder or multi-attestor operations;
- add policy deactivation and emergency controls;
- add more adversarial contract tests;
- run static analysis;
- complete external review or audit;
- document allowlist risk clearly.

Required warning:

> Interlock Firewall reduces agent execution risk but does not guarantee the safety of allowlisted protocols.

## 14. What Counts As Ready For Developers

The project is ready for alpha developers when:

- contracts are deployed on Mantle Sepolia;
- deployment manifest exists;
- SDK can be installed or linked by another project;
- docs show a 10-15 minute integration path;
- dashboard reads real on-chain events;
- at least one safe action and one blocked action are visible in Flight Recorder;
- examples run locally;
- `pnpm check`, `pnpm test`, and `pnpm smoke:all` pass;
- README explains limitations and threat model;
- no private keys are stored by the product.

## 15. Roadmap

### Phase 1: Local Alpha

Status: done.

- contracts;
- SDK;
- CLI;
- indexer;
- dashboard;
- docs;
- examples;
- full local smoke suite.

### Phase 2: Mantle Sepolia Live Alpha

Status: core done for Dev Alpha; final public hosting/demo assets remain user-owned.

- contracts deployed on Mantle Sepolia;
- deployment manifest/env/report generated;
- live smoke and live readiness scripts exist;
- final public dashboard URL, public GitHub URL, and demo video are still submission-owned.

### Phase 3: SDK Beta

- stabilize API names;
- publish packages or tarballs;
- collect first external integration feedback;
- decide whether framework adapters should become package exports or stay examples.

### Phase 4: Security Hardening

- production recorder/attestor operations;
- emergency pause/deactivation;
- fuzz/property tests;
- Slither/static analysis;
- external review.

### Phase 5: Public Dev Release

- hosted docs;
- hosted dashboard;
- npm package publication;
- Mantle mainnet beta only after review.

## 16. Final Product Pitch

Long version:

> Interlock Firewall is a Mantle-native safety middleware for autonomous AI agents. It gives developers an SDK and on-chain registries to simulate agent actions, enforce policy, record decisions, and build verifiable agent reputation before agents move funds.

Short version:

> Pre-flight security and accountability for AI-agent transactions on Mantle.

## 17. Focus Rule

Do not inflate the product.

The core must stay:

```text
policy -> simulation -> decision -> attestation -> reputation
```

x402, ZK, RWA-specific policy packs, Safe modules, ERC-7579, and ERC-8004 should stay as integrations or roadmap items unless they directly support this core flow.
