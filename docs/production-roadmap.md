# Interlock Firewall Production Roadmap

This roadmap explains how to move Interlock Firewall from the current developer alpha into a product that other Mantle teams can integrate into real AI agents, wallets, and automation backends.

The product focus is:

```text
agent framework / wallet / backend
  -> Interlock Firewall SDK
  -> simulation + policy decision
  -> optional execution
  -> on-chain attestation
  -> reputation / audit / monitoring
```

Interlock Firewall should not become a wallet, trading bot, RWA platform, or generic security scanner. It is safety middleware before `sendTransaction`.

## 1. Current State

Implemented:

- pnpm monorepo;
- Solidity contracts:
  - `AgentRegistry`;
  - `PolicyRegistry`;
  - `ActionAttestationV3`;
  - `PolicyGuardedExecutor`;
  - `DisputeEscrow`;
  - `AttestorCommittee`;
  - `ReputationOracle`;
- TypeScript SDK:
  - `checkAction`;
  - `recordDecision`;
  - `guardedSendTransaction`;
  - `getPolicy`;
  - `getAgentStats`;
  - `getActionHistory`;
  - policy admin helpers;
  - policy packs;
  - agent/tool adapters;
  - preflight API handler;
  - EIP-712 attestation signing helpers;
  - dispute/finalize helpers;
- CLI:
  - registration;
  - policy create/import/audit/apply;
  - preflight;
  - record;
  - history;
  - doctor;
  - policy maintenance;
- Indexer:
  - SQLite store;
  - event sync;
  - REST API;
  - agent, policy, action, and stats endpoints;
- Next.js dashboard:
  - wallet connect;
  - agent registration;
  - policy creation;
  - policy maintenance;
  - benchmark runner;
  - analytics;
  - webhooks;
  - live preflight;
  - on-chain attestation;
  - Flight Recorder;
- Examples:
  - raw Viem;
  - agent framework adapter;
  - GOAT-style adapter;
  - AgentKit-style adapter;
  - Vercel AI SDK-style adapter;
  - LangChain-style adapter;
  - backend automation;
  - preflight API route;
- Docs:
  - architecture;
  - integration guide;
  - API reference;
  - deployment;
  - CLI;
  - indexer;
  - threat model;
  - limitations;
  - demo runbook;
  - hosted docs routes;
  - release engineering;
  - audit readiness;
  - submission readiness;
- Verification:
  - `pnpm check`;
  - `pnpm test`;
  - `pnpm smoke:all`;
  - local contract smoke;
  - package smoke;
  - consumer smoke;
  - dashboard production smoke;
  - submission doctor.

This is a Mantle Sepolia Dev Alpha with deployed contracts, live smoke infrastructure, release packaging, and hosted-dashboard readiness. The next product step is public handoff: final public repository URL, final hosted dashboard URL, demo video, optional hosted Recorder API, and external review before production claims.

## 2. Product Definition

Correct definition:

> Interlock Firewall is a policy, simulation, and attestation layer that developers call before an autonomous AI agent executes an on-chain action.

What it does:

- receives a proposed transaction from an agent;
- simulates the action;
- checks it against a policy;
- returns a machine-readable decision;
- lets the app execute or block the action;
- records the decision on-chain;
- builds agent behavior history and simple reputation counters.

What it does not do in v1:

- does not custody funds;
- does not store private keys;
- does not replace wallet infrastructure;
- does not replace smart contract audits;
- does not guarantee allowlisted protocols are safe;
- does not run real-capital trading strategies.

## 3. Target Users

Primary users:

- AI-agent developers;
- agentic wallet builders;
- DeFi automation teams;
- teams using GOAT, AgentKit, LangChain, Vercel AI SDK, or custom agents.

Secondary users:

- protocols that want agents to interact with their contracts under explicit rules;
- wallet teams that need agent-specific transaction preview and enforcement;
- security/audit teams that need a behavior history for autonomous agents.

## 4. Core Use Cases

### DeFi Agent Guard

An agent proposes a swap, deposit, or withdraw. The firewall checks:

- allowed target;
- allowed selector;
- native value limit;
- expected slippage;
- simulation success.

### Payment Agent Guard

An agent proposes payouts or recurring payments. The firewall checks:

- recipient allowlist;
- value per action;
- policy active state;
- future roadmap: daily or time-window budget.

### RWA Agent Guard

An agent interacts with a vault or asset contract. The firewall checks:

- allowed asset contracts;
- max exposure;
- required manual review metadata;
- future roadmap: richer policy pack templates for RWA workflows.

### Agent Framework Middleware

The main adoption path:

```text
LLM/tool planner -> proposed tx -> firewall.checkAction -> sendTransaction or block
```

## 5. Architecture

```text
AI Agent Runtime
  - AgentKit / GOAT / LangChain / custom
  - produces intent and tx

Interlock SDK
  - normalizes action
  - loads policy
  - simulates tx
  - runs risk checks
  - returns decision
  - records attestation

On-Chain Contracts
  - AgentRegistry
  - PolicyRegistry
  - ActionAttestation

Indexer / API
  - reads registry and action events
  - exposes history and stats
  - powers dashboard

Dashboard
  - agent profile
  - policy manager
  - action review
  - Flight Recorder
  - integration status
```

## 6. Contract Roadmap

### AgentRegistry

Current:

- register agent;
- store owner and metadata URI;
- reputation counters;
- events.

Next:

- update metadata;
- transfer ownership;
- deactivate agent;
- active status checks;
- metadata schema docs.

### PolicyRegistry

Current:

- create policy;
- update limits and active state;
- allow/deny targets;
- allow/deny selectors;
- enumerate allowlists.

Next:

- policy metadata hash;
- recorder allowlist;
- optional time-window budgets;
- manual review threshold.

Do not add a complex on-chain policy DSL in v1. Keep on-chain rules compact and use off-chain policy packs for richer context.

### ActionAttestation

Current:

- record `ALLOW` or `BLOCK`;
- require attestor-signed EIP-712 decisions;
- protect records with per-agent nonces and deadlines;
- expose ACTIVE / CHALLENGED / FINALIZED status with a dispute window;
- reject invalid `ALLOW` attestations that violate policy;
- update agent counters;
- emit `ActionChecked`.

Next:

- execution result recording;
- multi-attestor or authorized-recorder production model;
- production-grade operational monitoring;
- external audit before mainnet claims.

## 7. SDK Roadmap

The SDK is the main product surface.

Current public API includes:

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

Current adapter helpers:

```ts
createGuardedViemWallet()
createAgentFirewallTool()
createFirewallActionHandler()
withInterlockFirewall()
```

Next SDK work:

- stable simulator interface;
- stronger typed errors;
- signed decision receipt helpers;
- richer examples for popular agent frameworks;
- public package publishing path.

## 8. Simulation Layer

Current:

- Viem `publicClient.call` simulation through the SDK.

Future simulator interface:

```ts
interface TransactionSimulator {
  simulate(action: AgentAction): Promise<SimulationResult>;
}
```

Potential adapters:

- `ViemCallSimulator`;
- `TenderlySimulator`;
- deterministic simulator fixtures for tests;
- future asset-delta simulators.

## 9. Framework Adapters

Current examples cover:

- raw Viem;
- framework-style plan/execute wrapper;
- GOAT-style adapter;
- Coinbase AgentKit-style adapter;
- Vercel AI SDK-style tool wrapper;
- LangChain-style tool wrapper;
- backend automation;
- preflight API route.

Goal:

> A team should be able to place Interlock Firewall between its agent planner and wallet execution without rewriting the whole agent.

## 10. Indexer And API Roadmap

Current indexer:

- syncs core events;
- persists to SQLite;
- exposes read API.
- supports filters and pagination metadata;
- exposes analytics and benchmark-friendly history;
- dispatches signed webhooks when configured.

Future hardening:

- sync state per chain/contract;
- optional Postgres backend;
- hosted public Recorder API with monitoring;
- stronger rate-limit and retry controls for production traffic.

Core endpoints:

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

## 11. Dashboard Roadmap

The dashboard should stay a developer console.

Current:

- action review;
- policy maintenance;
- Flight Recorder;
- benchmark arena;
- analytics;
- status center;
- agent detail page;
- public Agent Safety Card;
- docs/changelog routes;
- wallet and contract state.

Next:

- policy detail page;
- clearer distinction between simulated, recorded, and executed transactions.

## 12. Documentation Roadmap

Docs required for adoption:

- getting started;
- integration guide;
- API reference;
- contracts;
- policies;
- simulation;
- adapters;
- deployment;
- threat model;
- limitations;
- examples;
- demo runbook.

The README should keep a 10-minute path:

1. install;
2. configure contracts;
3. register agent;
4. create/import policy;
5. check action;
6. record decision;
7. read Flight Recorder.

## 13. Security Model

Threats to document:

- malicious or compromised agent;
- prompt injection;
- bad tool call;
- wrong target;
- overspend;
- unknown selector;
- failed simulation;
- malicious recorder;
- owner misconfiguration;
- allowlisted protocol exploit;
- malicious RPC.

Protects against:

- agent calls unknown contract;
- agent spends more than allowed;
- agent calls unknown function selector;
- simulation fails;
- expected slippage exceeds policy;
- missing audit trail.

Does not protect against:

- exploit inside an allowlisted protocol;
- malicious policy owner;
- all MEV/slippage outcomes;
- all token approval edge cases;
- LLM prompt security by itself.

## 14. Deployment Roadmap

### Local

Status: done.

- local tests;
- local smoke;
- live-read examples;
- production dashboard smoke.

### Mantle Sepolia

Status: Dev Alpha deployment exists.

Completed:

1. Mantle Sepolia core contracts are deployed.
2. Deployment manifest/env files exist under `deployments/mantle-sepolia/`.
3. Readiness, verification, local smoke, and live-demo invariant scripts exist.

Public handoff steps:

1. host the dashboard and optional Recorder API;
2. run `pnpm submission:doctor:live`;
3. regenerate `submission/interlock-firewall-submission.md` with public URLs;
4. record the final demo video;
5. run `pnpm submission:doctor:final`.

### Mantle Mainnet

Only after:

- recorder model is hardened;
- Dev Alpha signed decision receipts are reviewed for production use;
- contracts are reviewed;
- docs explicitly warn about limitations.

## 15. Testing Strategy

Contracts:

- ownership;
- policy updates;
- allowlist changes;
- reputation counters;
- unauthorized calls;
- invalid `ALLOW` attestations;
- local smoke with safe and blocked actions.

SDK:

- policy evaluation;
- calldata selector extraction;
- simulation success/failure;
- error normalization;
- action handler responses;
- package exports.

Indexer:

- event parsing;
- idempotent sync;
- SQLite persistence;
- API models;
- filters.

Frontend:

- production build;
- dashboard smoke;
- expected dashboard sections;
- browser-level interaction tests;
- Playwright e2e for landing, app, and status surfaces.

Release:

- package smoke;
- packed tarball checks;
- external consumer install;
- examples smoke.

## 16. CI And Release

Current CI should continue to run:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
pnpm smoke:all
```

Runtime packages:

- `@interlock/shared`;
- `@interlock/firewall-sdk`;
- `@interlock/indexer`;
- `@interlock/cli`.

Versioning plan:

- `0.1.x`: hackathon/dev alpha;
- `0.2.x`: stable SDK beta;
- `0.3.x`: framework adapters and indexer hardening;
- `1.0.0`: reviewed contracts and stable APIs.

## 17. Milestones

### Milestone 1: Local Alpha

Status: done.

Acceptance:

- `pnpm check` passes;
- `pnpm test` passes;
- `pnpm smoke:all` passes;
- docs and examples are linked from README.

### Milestone 2: Mantle Sepolia Public Alpha

Status: core done; final public submission assets remain user-owned.

Acceptance:

- public testnet contracts deployed;
- manifest/env/report generated;
- live smoke creates one safe and one blocked attestation;
- dashboard can show live Flight Recorder records through hosted/local Recorder or RPC fallback;
- submission bundle includes real addresses.

### Milestone 3: SDK Beta

Status: mostly done for Dev Alpha; npm publication remains user-owned.

Acceptance:

- API names are stable;
- public package install path works;
- examples cover real agent runtime styles;
- docs show integration in under 15 minutes.

### Milestone 4: Security Hardening

Status: partially done for Dev Alpha; production audit and mainnet approval remain external.

Acceptance:

- EIP-712 receipts;
- replay protection;
- action deadlines;
- static analysis;
- property/invariant tests;
- authorized recorder or multi-attestor production model;
- explicit production limitations.

### Milestone 5: Public Dev Release

Status: repo-ready; public URLs, npm publish, and final demo video remain user-owned.

Acceptance:

- hosted docs;
- hosted dashboard;
- npm packages or release tarballs;
- verified Mantle Sepolia contracts;
- external teams can integrate without repository-specific assumptions.

## 18. Definition Of Done

The project is ready for alpha developers when:

- contracts are deployed on Mantle Sepolia;
- SDK APIs are documented;
- examples work:
  - raw Viem;
  - agent framework;
  - GOAT-style adapter;
  - AgentKit-style adapter;
  - Vercel AI SDK-style adapter;
  - LangChain-style adapter;
  - backend automation;
  - preflight API;
- dashboard reads real on-chain events;
- docs explain setup and limitations;
- tests cover contracts, SDK, indexer, and examples;
- CI runs automatically;
- packages can be consumed outside the monorepo;
- a new developer can integrate the firewall before `sendTransaction` in under 15 minutes.

## 19. Final Product Shape

Final pitch:

> Interlock Firewall is a Mantle-native safety middleware for autonomous agents. It gives developers a simple SDK and on-chain registry to simulate agent actions, enforce policies, record decisions, and build verifiable agent reputation.

Strongest architecture:

```text
AgentKit / GOAT / custom agent
  -> Interlock SDK
  -> simulation adapter
  -> policy engine
  -> ActionAttestation on Mantle
  -> Indexer/API
  -> developer dashboard
```

Keep the core focused:

```text
policy -> simulation -> decision -> attestation -> reputation
```
