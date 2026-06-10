<p align="center">
  <img src="apps/web/public/icon.png" alt="Interlock" width="120" height="120" />
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-34d39e?style=flat-square"></a>
  <img alt="Network" src="https://img.shields.io/badge/Mantle-Sepolia%205003-3fd5ff?style=flat-square">
  <img alt="Status" src="https://img.shields.io/badge/status-Dev%20Alpha-f5a623?style=flat-square">
  <img alt="Track" src="https://img.shields.io/badge/BGA-AI%20Trading%20%26%20Strategy-8b5cf6?style=flat-square">
  <a href="FUNCTIONS.md"><img alt="Function Reference" src="https://img.shields.io/badge/reference-FUNCTIONS.md-6366f1?style=flat-square"></a>
</p>

# Interlock - a firewall for autonomous AI agents on Mantle

Interlock is a **pre-flight firewall and control plane** for AI agents. It checks every transaction or
multi-step action bundle an agent proposes -
against an on-chain policy, a live RPC simulation, and an advisory AI risk layer - **before** it is
signed, then records tamper-proof, disputable, and **enforceable** evidence of the decision on
**Mantle Sepolia**.

```text
agent proposes action/bundle -> policy + calldata + simulation + risk evidence -> ALLOW / BLOCK
                                                                  -> proposal lifecycle
                                                                  -> EIP-712 attestation
                                                                  -> optional on-chain enforcement
                                                                  -> indexed evidence -> reputation
```

**Status:** Mantle Sepolia **Developer Alpha**. Not audited; testnet only; no mainnet custody claims.
See [SECURITY.md](SECURITY.md).

---

## For judges — BGA "AI Trading & Strategy"

The risk-management + transparency layer that makes AI trading agents **safe and auditable**. We ship a
working **AI yield-strategy agent that trades through the firewall** — every move pre-flighted and
recorded on-chain.

**See it in 60 seconds** — live: **https://interlock-mantle.vercel.app**
- Straight to the demo: **[interlock-mantle.vercel.app/app?view=strategy-agent](https://interlock-mantle.vercel.app/app?view=strategy-agent)** → *Run strategy agent*: live DefiLlama yields → the strategy picks a
  pool (with an advisory AI review) → Interlock **ALLOWs** a sized allocation (on-chain tx) → **BLOCKs**
  an over-budget trade → every decision recorded on-chain. (Walkthrough: [docs/demo-script.md](docs/demo-script.md).)
- Public proof, no wallet: **[interlock-mantle.vercel.app/agent/13](https://interlock-mantle.vercel.app/agent/13)**
  — this agent's full on-chain decision history, committee-verified.

**Verify it's real (no mocks):** signal = live DefiLlama Mantle pools · venue = a deployed contract ·
decisions = on-chain attestations. Proof on [Mantlescan](https://sepolia.mantlescan.xyz): allocation
executed [`0x27d7…fb40`](https://sepolia.mantlescan.xyz/tx/0x27d7fe8afd157db9e100d5ba5b01fe5a58f274a1abe0780eb99f326ec5bdfb40)
→ recorded on V4 [`0xcbe4…6e25`](https://sepolia.mantlescan.xyz/tx/0xcbe4ccca44fcbe8a9a3a0ba4ec55e07620d009be828661b40ed82a7806f66e25).

**Live on Mantle Sepolia** — 8 contracts. Committee-verified recording **ActionAttestationV4**
`0x69a2ec64285caa68934c4ee1c2f4fab29b08c083`; on-chain ERC-20 enforcement **TokenGuardedExecutor**
`0x4ab52cbfaf06afc1058c4bb05d7fb1511df01258`; strategy venue vault `0x15e08d2a…` / router `0x0b62f548…`.

**Rubric → evidence:** [docs/submission.md](docs/submission.md) maps every Part A + Part B criterion to
concrete proof. Every function/route/contract: [FUNCTIONS.md](FUNCTIONS.md).

---

## Contents

- [What it is](#what-it-is) | [On-chain security model](#on-chain-security-model) | [Current deployment](#current-deployment-mantle-sepolia--chain-5003)
- [Repository layout](#repository-layout) | [Developer surfaces](#developer-surfaces) | [Requirements](#requirements) | [Install & quickstart](#install--quickstart)
- [Dashboard](#dashboard) | [AI layer](#ai-layer-advisory) | [Agent demo](#agent-demo-end-to-end)
- [SDK](#sdk) | [MCP server](#mcp-server) | [REST preflight API](#rest-preflight-api) | [CLI](#cli)
- [Recorder API, observability & webhooks](#recorder-api-observability--webhooks) | [Contracts](#contracts) | [Environment](#environment)
- [Benchmark Arena](#benchmark-arena) | [Capabilities](#capabilities-beyond-core-preflight) | [Reliability & edge cases](#reliability--edge-cases) | [Production hardening](#production-hardening)
- [Policy packs & versioning](#policy-packs-presets--versioning) | [Examples](#examples) | [Testing & readiness](#testing--readiness) | [Build, ship & CI](#build-ship--ci) | [Limitations](#limitations) | [Documentation](#documentation)

---

## What it is

AI agent frameworks give agents wallets, tools, and the ability to execute transactions. Interlock is
the **safety + evidence + enforcement layer before `sendTransaction`** - the closest mental model is a
protected CI/CD pipeline for on-chain actions: the agent can *propose* work, but policy + checks
decide whether the action is allowed, and the decision is logged (and, optionally, enforced) on-chain.

Two layers, both live on Mantle Sepolia:

- **Advisory / evaluation** (off-chain, cheap, fast): policy read + `eth_call` simulation + an
  AI-powered risk explanation -> a deterministic `ALLOW`/`BLOCK` with a reason code, recorded
  as an **attestor-signed (EIP-712) attestation with a dispute window**.
- **Enforcement + economics + decentralization** (on-chain): an agent can route execution **through**
  a guard that reverts disallowed actions; disputes carry **bonds + slashing**; attestation can require
  an **m-of-n committee**; an agent's record becomes a **queryable reputation score**.

The AI layer is **advisory only** - it explains and risk-scores, but never overrides the deterministic
firewall or the on-chain record. Current policy checks cover target allowlists, selector allowlists,
native value limits, slippage metadata limits, active policy state, and RPC simulation outcome.

---

## On-chain security model

**ActionAttestationV3 - record-immediately + dispute window + EIP-712 + evidence commitment.** Every
decision is signed by an authorized off-chain attestor (EIP-712); `recordAction` recovers the signer
and requires it to equal the on-chain `attestor`, so a recorded `ALLOW`/`BLOCK` is provably the
*evaluated* decision (per-agent `nonces` guard replay; a `deadline` guards staleness). Each record
carries `status` (ACTIVE -> CHALLENGED / FINALIZED) and `finalizableAt = block.timestamp +
DISPUTE_WINDOW` (2h); `challenge` flags it within the window, `finalize` stamps it after. The
`ActionChecked` event is append-only so older parsers keep decoding. It still runs the `ALLOW` sanity
checks (policy active, agent match, caller owns the policy, target/selector allowlisted, value <=
`maxNativeValue`) and updates `AgentRegistry` reputation.

**New in V3:** every record carries an `evidenceHash` - a keccak256 commitment to the off-chain
evidence object (intent, proposed tx, simulation, checks, decision, reason) that is part of the signed
EIP-712 payload, so the attestor commits to the exact evidence behind a decision. V3 also extends the
`ReasonCode` set with advisory risk codes (`RWA_OVEREXPOSURE`, `CONCENTRATION_RISK`,
`DAILY_REBALANCE_EXCEEDED`, `STALE_POLICY`, `WRONG_CHAIN`) so those decisions are recordable on-chain.
V3 is a **non-destructive upgrade** - it deploys against the existing registries and re-points
`AgentRegistry.setActionAttestation(v3)`, so all prior agents, policies, and history survive.

The four enforcement/economic/decentralization contracts are **additive and standalone** (no V2
redeploy; dependency-free, solc 0.8.30, hand-rolled EIP-712 + `ecrecover`):

1. **PolicyGuardedExecutor** - `execute(agentId, policyId, target, value, data)` validates against the
   on-chain policy (active | agent match | target/selector allowlist | value limit) and **reverts a
   disallowed action before it runs**, forwarding only allowed ones. `previewExecute(...)` is an
   authoritative dry-run. Turns advisory recording into real enforcement.
2. **DisputeEscrow** - two-sided bonds: a recorder bonds a record's honesty, a challenger bonds a
   dispute, an arbiter resolves, and the **winner takes both bonds** (slashing). Pull-payment
   `withdraw()`; `reclaimRecordBond` after the window.
3. **AttestorCommittee** - `isApproved(digest, signatures[])` requires >= `threshold` **distinct**
   committee signatures; a reusable m-of-n decentralized-attestation primitive.
4. **ReputationOracle** - `getScore(agentId) -> (scoreBps, tier)` and `meetsThreshold(...)`, derived
   from AgentRegistry counters, so third-party contracts can gate on an agent's Interlock reputation.

See [`packages/contracts/README.md`](packages/contracts/README.md) and [docs/threat-model.md](docs/threat-model.md).

---

## Current deployment (Mantle Sepolia | chain `5003`)

RPC `https://rpc.sepolia.mantle.xyz` | Explorer `https://sepolia.mantlescan.xyz` |
manifest [deployments/mantle-sepolia/latest.json](deployments/mantle-sepolia/latest.json)

| Contract | Address | Role |
| --- | --- | --- |
| `AgentRegistry` | `0xa8d6f3478b683ee674ff5a9167e6838c589162b4` | Agent identity + reputation counters |
| `PolicyRegistry` | `0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0` | Policies: value/slippage limits, target + selector allowlists |
| `ActionAttestationV3` | `0xe95ae15769d4afb678360622ff4e7f9db7dd874d` | EIP-712 attestor-signed decisions + dispute window + `evidenceHash` + RWA reason codes |
| `ActionAttestationV2` *(deprecated)* | `0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3` | Superseded by V3; kept for historical records |
| `PolicyGuardedExecutor` | `0xd12a01a676f66c7660119e1c9a0fe3521ccdd564` | **Enforcement** - reverts disallowed actions on-chain |
| `DisputeEscrow` | `0xcb463c978becd38e913fb4b063f1e0aff8e04210` | **Bonds + slashing** for the dispute window |
| `AttestorCommittee` | `0x03e42606199f1832579941c9a947e8eb240d1cef` | **m-of-n** attestation threshold verifier |
| `ReputationOracle` | `0x69acc876f018677f9ed4f54b183d1703edd9d120` | **Score + tier** from agent counters |

Source of truth: [`packages/shared/src/addresses.ts`](packages/shared/src/addresses.ts). V3 events index
from block `39484074` (legacy V2 from `39344216`).

---

## Repository layout

```text
packages/
  contracts/   Solidity (registries, current ActionAttestationV3, deprecated V2, guard, escrow, committee, oracle) + deploy/test
  sdk/         @interlock/firewall-sdk - checkAction, bundles, token guard, RWA evidence, ERC-8004 helpers
  mcp/         MCP server for agent-native preflight/record/history/policy/ERC-8004 tools
  cli/         Interlock CLI (init, doctor, status, benchmark, policy packs, ABI builder, starter generator)
  indexer/     SQLite event indexer + HTTP read API (/snapshot, /health, /metrics, /status, /proposals)
  shared/      Mantle config, deployed addresses, ABIs, structured logger
apps/
  web/         Next.js dashboard - landing "/" + control plane "/app"
  agent-demo/  One-shot benchmark + autonomous demo loop
examples/      raw-viem, agent-framework, goat-adapter, agentkit-adapter, byreal-realclaw-adapter, backend-automation, preflight-api
docs/          Architecture, integration, observability, ship runbook, security
schemas/       Policy pack + REST API JSON schemas
deployments/   Mantle Sepolia manifests
```

---

## Developer surfaces

| Surface | Purpose | Primary user |
| --- | --- | --- |
| SDK (`@interlock/firewall-sdk`) | Pre-flight + bundles + token guard + RWA evidence + record/enforce/dispute/reputation in agent/backend code | TypeScript/Viem developers |
| REST API | Backend agents create proposals, preflight single tx or action bundles, read recorder/yield/analytics data | Agent runtime teams |
| MCP server | IDE/LLM agents call preflight, record, history, policy, explanation, benchmark, ERC-8004 manifest tools | Agent builders |
| CLI | Setup, doctor, status, CI, policy packs, ABI policy builder, starter generator, live reads/writes | Developers and maintainers |
| Dashboard | Landing + control plane: policies, preflight, proposal lifecycle, enforcement, agent demo, recorder, analytics, snippets | Builders and judges |
| Recorder API | Read agents, policies, proposals, attestations, status, analytics, metrics, webhook health, yield/RWA signals | Dashboard and integrations |
| Contracts | On-chain identity, policy, attestation, enforcement, dispute, committee, reputation | On-chain integrators |

---

## Requirements

- Node.js (repo toolchain) | `pnpm@10.32.1` | Mantle Sepolia RPC access.
- Test MNT only for write flows; an injected browser wallet only for dashboard writes.

## Install & quickstart

```bash
pnpm install
pnpm build:packages

# Dashboard - landing at /, control plane at /app
pnpm --filter @interlock/web dev          # http://localhost:3000  ->  /app

# Indexer - read API + metrics
pnpm indexer                             # http://localhost:8787/health  |  /metrics
```

Copy `.env.example` -> `.env`. All server-side keys are optional; each feature **degrades gracefully**
(its route returns `503`) when its key is unset: `ANTHROPIC_API_KEY` (AI layer),
`ATTESTOR_PRIVATE_KEY` (record signing), `PRIVATE_KEY` + `AGENT_ID` + `POLICY_ID` (agent demo + deploys).

Run against the latest live deployment in one command:

```bash
pnpm live:demo                           # starts indexer + dashboard from deployments/mantle-sepolia/latest.env
```

---

## Dashboard

`apps/web` ships a **marketing landing at `/`** (what the firewall is, how it works, live indexer
stats, **Launch app**) and the authenticated **control plane at `/app`** (8 tabs). It renders only
real RPC/indexer data - no synthetic history. Loading skeletons + toast notifications throughout.

| Tab | What |
| --- | --- |
| Dashboard | Live stats, action pipeline + reason charts, Flight Recorder, onboarding checklist |
| Agents | Agent Safety Card counters, **on-chain reputation badge** (ReputationOracle), optional ERC-8004 manifest/registry bridge |
| Policies | Policy builder, Mantle ecosystem pack picker, **ABI -> Policy Pack Builder**, **AI "Draft with AI"** (NL -> policy) |
| Preflight | Proposed-tx form, live simulation, ALLOW/BLOCK + check pipeline, **Bundle Review**, token/RWA evidence, **AI risk explainer**, record on-chain, **Execute (enforced)** via the guard |
| Benchmark | Repeatable safety scenarios + multi-step bundle scenario with per-check result detail |
| **Agent Demo** | Run the autonomous loop live (`/api/demo/run`), streaming decisions into the dashboard |
| Recorder | Searchable `ActionChecked` evidence + dispute chips + **Dispute Escrow** bond/dispute/withdraw |
| Analytics | Recorder-derived metrics + reason distribution + optional **AI block summary** |
| Integrate | SDK / bundle / CLI generator / env snippets with copy buttons + deployed contract links + live yield/RWA sync |

Public read-only **Agent Safety Card** at `/agent/:id` (no wallet). Web health at `/api/health`.

---

## AI layer (advisory)

A server-side route `/api/ai` (reads `ANTHROPIC_API_KEY`, never exposed to the browser) powers, via
Claude tool-use with validated structured output:

- **Risk explainer** - plain-language explanation + independent 0-100 risk score per decision
  (Claude Haiku 4.5).
- **NL -> policy** - "swap on Merchant Moe up to 2 MNT, 1% slippage" -> a reviewable policy draft
  (Claude Sonnet 4.6); never auto-submits.
- **Block-pattern summary** - narrates what the firewall is blocking + suggests policy tweaks.

The AI never drives `ALLOW`/`BLOCK` and never enters the on-chain attestation - the deterministic
firewall stays the sole source of truth, and everything works with `ANTHROPIC_API_KEY` unset.

---

## Agent demo (end-to-end)

An autonomous agent that proposes safe + adversarial actions, runs each through the firewall, and
records the decision on-chain (both ALLOW and BLOCK - a BLOCK attestation is evidence too). Records
auto-index and stream into the live Flight Recorder. The goal runner can also persist a real proposal
lifecycle through the Recorder API when `RECORDER_URL` or `INDEXER_URL` is configured.

```bash
# Autonomous loop (records real attestations; needs PRIVATE_KEY + AGENT_ID + POLICY_ID)
pnpm --filter @interlock/agent-demo demo:loop -- --iterations 3 --interval 4

# One-shot benchmark (read-only by default; add RECORD_DECISIONS=true to record)
pnpm --filter @interlock/agent-demo demo

# Goal runner: goal -> proposal -> action bundle -> preflight -> optional record
RECORDER_URL=http://127.0.0.1:8787 pnpm --filter @interlock/agent-demo goal -- --goal "review Mantle agent action"
```

The same loop drives the **Agent Demo** tab via `/api/demo/run` (server-only key). See
[`apps/agent-demo/README.md`](apps/agent-demo/README.md).

### AI yield-strategy agent (trades through the firewall)

The **Strategy Agent** tab (`/api/strategy-demo/run`) is an AI trading/strategy agent that reads **live
DefiLlama Mantle yields** and ranks them with a deterministic, explainable strategy
(`pickAllocation` — APY × liquidity confidence, skipping thin/absurd-APY pools), then routes the chosen
allocation **through the firewall** (`runGatewayAction` "execute-if-allowed"): an allocation within
limits executes on-chain into the strategy vault; an over-budget trade is **blocked** — every decision
recorded on-chain (committee-verified). This is the "AI Trading & Strategy" surface: real signal → real
strategy → enforced risk → on-chain auditability. Setup + flow in
[docs/demo-script.md](docs/demo-script.md); rubric mapping in [docs/submission.md](docs/submission.md).

## Business & GTM

Every team shipping autonomous on-chain agents needs a safety + compliance layer they don't have to
build. Interlock is that layer, drop-in via SDK / MCP / CLI / REST. **Who pays:** agent/trading-bot
teams, custodians, and DeFi protocols exposing agent access. **Revenue paths:** metered attestations
(pay-per-recorded-decision), a hosted Recorder/analytics SaaS, and enterprise policy-pack + committee
operation. **Wedge:** the firewall + on-chain flight recorder; **moat:** the auditable decision history
and the m-of-n attestor committee. A protocol token (out of scope for Dev Alpha) would coordinate the
committee (stake/slash) and meter attestations.

---

## SDK

```ts
import { InterlockFirewall, agentRegistryGetAgentCalldata, assertAllowed } from "@interlock/firewall-sdk";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";

const firewall = new InterlockFirewall({
  chain: mantleSepolia,
  rpcUrl: process.env.MANTLE_RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  contracts: deployedAddresses.mantleSepolia,
});

// 1. Pre-flight (off-chain): policy + simulation -> ALLOW/BLOCK
const decision = await firewall.checkAction({
  agentId: 1n,
  policyId: 1n,
  tx: { to: deployedAddresses.mantleSepolia.agentRegistry, value: 0n, data: agentRegistryGetAgentCalldata(1n) },
  metadata: { intent: "Read agent profile", expectedSlippageBps: 0 },
});
if (!decision.allowed) return { blocked: true, reason: decision.reasonCode };

// 2. Record the attestor-signed decision (EIP-712, dispute window)
const attestation = await firewall.recordDecisionAndWait(decision);   // -> { actionCheckId, transactionHash, ... }

// or: guarded send (preflight -> send if allowed -> record)
const result = await firewall.guardedSendTransaction(action);          // -> { sent, transactionHash, attestationHash }

// or: agent gateway for SDK/REST/MCP runtimes
const gateway = await firewall.runGatewayAction(action, {
  mode: "dry-run", // dry-run | record-only | execute-if-allowed | block-and-alert
});

// or: multi-step route pre-flight; bundle ALLOW only when every action passes
const bundle = await firewall.checkActionBundle({
  agentId: 1n,
  policyId: 1n,
  intent: "Review a multi-step Mantle route before execution",
  metadata: { source: "agent", routeProvider: "manual", expectedSlippageBps: 0 },
  actions: [action],
});
```

Developer helpers also cover ERC-20 calldata risk (`decodeErc20Action`, `evaluateTokenRules`),
RWA/yield advisory evidence (`buildRwaRiskEvidence`, `hashRwaRiskEvidence`), ERC-8004 manifest/registry
bridges (`buildErc8004AgentManifest`, `getErc8004Agent`), and policy generation from real ABIs
(`generatePolicyPackFromAbi`). These helpers are additive: deployed contracts remain the source of
on-chain policy enforcement, while off-chain checks add developer evidence before execution.

On-chain follow-ons (pass the relevant address from `deployedAddresses.mantleSepolia`):

```ts
// Enforcement - reverts on-chain if disallowed
await firewall.executeThroughGuard({ executor, agentId: 1n, policyId: 1n, target, value, data });
const { allowed, reasonCode } = await firewall.previewGuard({ executor, agentId: 1n, policyId: 1n, target, value, data });

// Dispute staking - winner (arbiter-decided) takes both bonds
await firewall.bondRecord({ escrow, actionCheckId, bond });
await firewall.openDispute({ escrow, actionCheckId, bond });
await firewall.resolveDispute({ escrow, actionCheckId, challengerWins: true });   // arbiter only
await firewall.withdrawDisputeFunds(escrow);

// Dispute window on V2
await firewall.challengeAction(actionCheckId, "reason");
await firewall.finalizeAction(actionCheckId);

// Decentralized attestation + reputation
const ok = await firewall.committeeApproved(committee, digest, [sig1, sig2]);
const { scoreBps, tier } = await firewall.getReputation(oracle, 1n);
```

Reads (`getPolicy`, `getAgentStats`, `getActionHistory`, `isTargetAllowed`, `isSelectorAllowed`),
setup (`registerAgentAndWait`, `createPolicyAndWait`, `createPolicyFromPresetAndWait`), and policy-pack
helpers (`auditPolicyPack`, `applyPolicyPack`) are documented in [docs/api-reference.md](docs/api-reference.md).
Errors return a stable `code`, `message`, and actionable `action`:

```ts
import { actionableError } from "@interlock/firewall-sdk";
try { await firewall.recordDecision(decision); }
catch (e) { const f = actionableError(e); console.error(f.code, f.message, f.action); }
```

The SDK + `@interlock/shared` are publish-ready (`pnpm release:dry` runs a `pnpm publish --dry-run`).
See [`packages/sdk/README.md`](packages/sdk/README.md).

---

## MCP server

```bash
pnpm mcp
```

Exposes preflight, gateway, record, benchmark, safety-card, policy, history, explanation, and ERC-8004
tools (full list in [FUNCTIONS.md](FUNCTIONS.md#mcp-tools)). Config:

```json
{
  "mcpServers": {
    "interlock": {
      "command": "pnpm",
      "args": ["--filter", "@interlock/mcp", "start"],
      "env": {
        "MANTLE_RPC_URL": "https://rpc.sepolia.mantle.xyz",
        "AGENT_REGISTRY": "0xa8d6f3478b683ee674ff5a9167e6838c589162b4",
        "POLICY_REGISTRY": "0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0",
        "ACTION_ATTESTATION": "0xe95ae15769d4afb678360622ff4e7f9db7dd874d",
        "FROM_BLOCK": "39484074"
      }
    }
  }
}
```

Add `PRIVATE_KEY` only when the agent should record decisions; preflight + history reads work without
it. The ERC-8004 tools default to the **verified official** Mantle Sepolia registries (override with
`ERC8004_IDENTITY_REGISTRY` / `ERC8004_REPUTATION_REGISTRY`); `interlock_register_erc8004_identity`
registers an agent into the official IdentityRegistry (needs `PRIVATE_KEY`). See [docs/mcp.md](docs/mcp.md).

---

## REST preflight API

A reference server (`examples/preflight-api`) for backend agent runtimes that POST proposed-tx JSON:

```bash
POLICY_ID=<id> AGENT_ID=<id> pnpm --filter @interlock/example-preflight-api serve   # add PRIVATE_KEY to enable /record or write gateway modes

curl -X POST http://127.0.0.1:8790/preflight -H "content-type: application/json" \
  -d '{"to":"0x...","value":"0","data":"0x2de5aaf7...","intent":"Read agent profile","expectedSlippageBps":0}'

curl -X POST http://127.0.0.1:8790/gateway/action -H "content-type: application/json" \
  -d '{"mode":"dry-run","to":"0x...","value":"0","data":"0x","intent":"Check before agent execution"}'

curl -X POST http://127.0.0.1:8790/preflight/bundle -H "content-type: application/json" \
  -d '{"intent":"Review a multi-step agent route","routeProvider":"manual","actions":[{"to":"0x...","value":"0","data":"0x","intent":"Step 1"}]}'
```

Full route list in [FUNCTIONS.md](FUNCTIONS.md#rest--http-routes). Bundle preflight accepts a non-empty
`actions` array of the same proposed transaction shape and returns a JSON-safe `bundle` report; it does
not execute cross-chain routes or synthesize route results. Schemas: [rest-preflight-request](schemas/rest-preflight-request.schema.json),
[rest-record-request](schemas/rest-record-request.schema.json),
[rest-preflight-response](schemas/rest-preflight-response.schema.json). Rules: `to` is an EVM address;
`value` is a non-negative wei string; `data` is full calldata (`0x` for empty; `0x0`/odd-length
rejected); slippage is integer bps `0..10000`. See [docs/rest-api.md](docs/rest-api.md).

---

## CLI

```bash
pnpm cli -- init --out .env.interlock.local
pnpm cli -- doctor --no-fail
pnpm cli -- status --agent-id <id> --policy-id <id>
pnpm cli -- whoami
pnpm cli -- benchmark run --agent-id <id> --policy-id <id>
pnpm cli -- agent-get --agent-id <id>
pnpm cli -- policy-get --policy-id <id>
pnpm cli -- policy-check --policy-id <id> --target 0x... --selector 0x2de5aaf7
pnpm cli -- policy-create-preset --agent-id <id> --name conservative-defi --target 0x... --max-native 0.02 --private-key 0x...
pnpm cli -- policy-lint --file policies/conservative-defi.example.json          # policy-as-code lint (errors + advisory warnings)
pnpm cli -- gateway-run --mode dry-run --agent-id <id> --policy-id <id> --to 0x... --data 0x   # unified gateway entry
```

`policy-lint` powers the reusable [policy-check GitHub Action](.github/actions/policy-check) - see the
[`policy-check` workflow](.github/workflows/policy-check.yml) which lints policy packs on every PR.

`interlock quickstart` performs a full write flow (register agent -> create policy -> safe + blocked
preflight -> optional record). See [docs/cli.md](docs/cli.md).

---

## Recorder API, observability & webhooks

```bash
pnpm indexer            # http://localhost:8787   (or pnpm indexer:live for the live deployment)
```

**Read/API surface:** `/snapshot` (one request for the whole dashboard) plus agents, policies, actions
(+ filters), stats, benchmark, analytics, proposal-lifecycle, and live yield routes - full list in
[FUNCTIONS.md](FUNCTIONS.md#rest--http-routes). Proposal lifecycle is guarded by a state machine:
invalid transitions such as `blocked -> executed` or `rejected -> recorded` return `409` instead of
silently mutating history.

**Observability:** `/health` (sync state), `/status` + `/network` (recorder/contracts/sync),
**`/metrics`** (Prometheus: `interlock_up`, `interlock_last_synced_block`,
`interlock_actions_indexed_total`, `interlock_sync_errors_total`, `interlock_sync_duration_ms`). The web
app exposes **`/api/health`** (configured contracts + key-presence booleans + indexer reachability,
`x-request-id`). Structured JSON logs everywhere (shared `createLogger`, `LOG_LEVEL`-gated).

**Webhooks:** events `allow` / `block` / `simulation_failed` (+ `policy_changed` / `benchmark_failed`).
Default `generic` format is signed `x-interlock-signature: sha256=<hmac>` over the raw body; set
`WEBHOOK_FORMAT=discord|slack|telegram` to deliver a formatted chat message instead (Telegram also needs
`TELEGRAM_CHAT_ID`). Failures show in `/health` + `/status` without breaking sync. SQLite persists to a
deployment-scoped file by default. See [docs/observability.md](docs/observability.md),
[docs/webhooks.md](docs/webhooks.md), and [`packages/indexer/README.md`](packages/indexer/README.md).

---

## Contracts

Compile, test, deploy:

```bash
pnpm --filter @interlock/contracts compile      # solc (viaIR) -> artifacts/*.json
pnpm --filter @interlock/contracts test         # vitest + ganache (registries, V2/V3, guard, escrow, committee, oracle)

# Full from-scratch deploy (registries + V2 + guard)
cp .env.example .env
pnpm deploy:preflight
PRIVATE_KEY=0x... pnpm deploy:mantle-sepolia
pnpm live:readiness && pnpm live:verify

# Additive standalone deploys (preserve live state + addresses)
node scripts/env-run.mjs pnpm --filter @interlock/contracts exec tsx scripts/deploy-guard.ts     # PolicyGuardedExecutor
node scripts/env-run.mjs pnpm --filter @interlock/contracts exec tsx scripts/deploy-dispute.ts   # DisputeEscrow
node scripts/env-run.mjs pnpm --filter @interlock/contracts exec tsx scripts/deploy-extras.ts    # AttestorCommittee + ReputationOracle
node scripts/env-run.mjs pnpm --filter @interlock/contracts exec tsx scripts/deploy-v3.ts        # ActionAttestationV3 (re-points AgentRegistry; preserves agents/policies)
node scripts/env-run.mjs pnpm --filter @interlock/contracts exec tsx scripts/deploy-v4.ts        # ActionAttestationV4 (m-of-n committee recording; re-points AgentRegistry)
node scripts/env-run.mjs pnpm --filter @interlock/contracts exec tsx scripts/deploy-token-guard.ts # TokenGuardedExecutor (on-chain ERC-20 token-rule enforcement)
```

Each standalone script deploys one piece against the existing registries and patches
`packages/shared/src/addresses.ts` without touching the other live contracts. Optional test-strategy
targets: `DEPLOY_TEST_STRATEGY_CONTRACTS=true pnpm deploy:mantle-sepolia`. Live tests:
`pnpm live:smoke`, `pnpm live:full-test`, `pnpm live:adversarial`. Static analysis:
`pnpm security:slither`, `pnpm security:adversarial`. See [`packages/contracts/README.md`](packages/contracts/README.md)
and [docs/contract-verification.md](docs/contract-verification.md).

---

## Environment

```bash
cp .env.example .env
pnpm env:doctor          # checks RPC, chain id, contract bytecode, key presence, indexer health
```

Key variables (full list + comments in `.env.example`):

```bash
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
PRIVATE_KEY=0x...                       # deployer + agent demo (server-only)
ATTESTOR_PRIVATE_KEY=0x...              # /api/attest record signing (server-only)
ANTHROPIC_API_KEY=                      # AI layer (server-only; empty -> AI disabled gracefully)

AGENT_REGISTRY=        POLICY_REGISTRY=        ACTION_ATTESTATION=
POLICY_GUARDED_EXECUTOR=   DISPUTE_ESCROW=     ATTESTOR_COMMITTEE=   REPUTATION_ORACLE=

INDEXER_URL=   FROM_BLOCK=39484074   PORT=8787   AUTO_SYNC=true   SYNC_INTERVAL_MS=60000   LOG_LEVEL=info
WEBHOOK_URL=   WEBHOOK_SECRET=   WEBHOOK_EVENTS=block,simulation_failed   WEBHOOK_FORMAT=generic   TELEGRAM_CHAT_ID=

NEXT_PUBLIC_MANTLE_RPC_URL=   NEXT_PUBLIC_INDEXER_URL=   NEXT_PUBLIC_AI_ENABLED=
NEXT_PUBLIC_AGENT_REGISTRY=   NEXT_PUBLIC_POLICY_REGISTRY=   NEXT_PUBLIC_ACTION_ATTESTATION=
NEXT_PUBLIC_POLICY_GUARDED_EXECUTOR=   NEXT_PUBLIC_DISPUTE_ESCROW=   NEXT_PUBLIC_REPUTATION_ORACLE=
NEXT_PUBLIC_DEFAULT_AGENT_ID=   NEXT_PUBLIC_DEFAULT_POLICY_ID=
```

See [docs/environment.md](docs/environment.md). Secret hygiene: `.env` is gitignored;
`pnpm security:secrets` scans the tree; key rotation runbook in [SECURITY.md](SECURITY.md).

---

## Benchmark Arena

A repeatable pre-flight safety suite (**8 scenarios**) that scores an agent/policy against the live
firewall: safe agent read, unknown target, overspend, high slippage, unapproved approve selector,
selector-only calldata simulation failure, empty-calldata selector checks, and a multi-step bundle
route where one blocked action blocks the whole bundle. Every scenario runs through the same real
`checkAction` / `checkActionBundle` path used by the SDK/API; the suite does not fabricate portfolio
state, wrong-chain inputs, balances, history, or synthetic actions. Available in the dashboard
Benchmark tab, via `pnpm agent:benchmark`, and via the MCP `interlock_run_benchmark` tool. Produces a
Dev Alpha evidence score with track/category coverage and remediation, not a production trust score. See
[docs/benchmark-arena.md](docs/benchmark-arena.md).

## Capabilities beyond core preflight

Same core loop, extended for real Mantle agent workflows:

- **Action bundles** - `checkActionBundle` reviews a multi-step route; ALLOW only if every action passes (SDK, REST `/preflight/bundle`, dashboard).
- **Proposal lifecycle** - Recorder persists `proposed -> preflighted -> executed/blocked -> recorded` behind a state machine (invalid transitions -> `409`), shown as a real timeline (no fake rows).
- **Token transfer guard** - decodes ERC-20 `transfer`/`transferFrom`/`approve` and flags recipient/spender/amount/unlimited-approve risk (`evaluateTokenRules`) as **advisory, off-chain** evidence.
- **RWA / yield evidence** - `buildRwaRiskEvidence` over live DefiLlama yield signals -> advisory reason codes + an evidence hash (can feed `ActionAttestationV3.evidenceHash`).
- **ERC-8004 interop** - reads identity + reputation from the **verified official** Mantle Sepolia registries (Identity `0x8004A371…`, Reputation `0x8004B1Bc…`) and can register an agent / publish feedback (SDK `registerErc8004Agent`/`giveErc8004Feedback`, CLI `erc8004-register`, MCP `interlock_register_erc8004_identity`, dashboard CTA). Interlock acts as an ERC-8004 **Validator**; ValidationRegistry writes are deferred until that standard stabilizes. Override via `ERC8004_IDENTITY_REGISTRY` / `ERC8004_REPUTATION_REGISTRY`.
- **ABI -> policy pack** - `generatePolicyPackFromAbi` builds a reviewable policy template from a real contract ABI (SDK, CLI `policy-pack-from-abi`, dashboard "Build From ABI").
- **Starter generator** - CLI `init-agent-app` scaffolds a typechecked agent starter (no secrets copied).

## Reliability & edge cases

Every failure path has an explicit UI state (loader / retry / toast / empty / error / disabled) - no silent failures:

- **Wallet** - live `accountsChanged` / `chainChanged` / disconnect handling; wrong-network badge + Switch; full read-only mode with no wallet.
- **Transactions** - user-rejection, hung (timeout -> pending + explorer link), and on-chain revert with the **decoded** reason (Interlock custom errors decoded by name); a recent-tx banner recovers the link after a mid-flow reload.
- **Data** - RPC/indexer failure surfaces a retryable warning (not an empty dashboard); balance-load errors show a retrying state; honest empty states with CTAs.

Other handled cases: invalid address/calldata, odd-length hex, negative value, out-of-range slippage,
selector-only calldata, empty/wrong ids, missing contract address, policy/action mismatch, insufficient
funds, slow sync from block `0`. SDK + REST errors return a stable `code` / `message` / `action`.
Covered by Playwright e2e with a mock wallet + mock RPC. See [docs/common-mistakes.md](docs/common-mistakes.md).

## Production hardening

- **Headers / CSP** - CSP (report-only) + `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS (prod); `connect-src` allowlists RPC / indexer / Mantlescan / Anthropic.
- **Rate limiting** - env-tunable token bucket on every server route (`RATE_LIMIT_*_RPM`), degrade-safe.
- **Error tracking** - env-gated (`SENTRY_DSN`); no-op + structured log when unset, never throws.
- **Observability** - structured logger, indexer `/metrics` (Prometheus) + `/health` + public `/status`, web `/api/health`.
- **Audit-readiness (on-chain)** - Slither (CI, degrade-safe) + Solhint, vitest invariant tests, full NatSpec, [mainnet runbook](docs/mainnet-runbook.md) + verify scripts, [self-audit checklist](docs/audit-readiness.md). No mainnet deploy/audit performed.

## Policy packs, presets & versioning

- **Policy packs** - JSON-safe policy configs for CI/PR review: `auditPolicyPack` (drift check),
  `applyPolicyPack` (reconcile limits/allowlists, optional `prune`), and `lintPolicyPack` (advisory
  lint - no targets/selectors, unlimited-approve, out-of-range slippage, missing chainId). See
  [docs/policies.md](docs/policies.md).
- **Presets + Mantle ecosystem packs** - curated product-level templates: Merchant Moe, Agni CLMM,
  Fluxion RWA, **Odos router**, **generic Mantle DEX**, RWA yield, vault deposits, ... each with required
  addresses, selectors, value/slippage caps, allowed-token notes, route-length limit, and approve
  warnings. The dashboard and SDK can apply them. See [docs/policy-presets.md](docs/policy-presets.md)
  and [docs/mantle-ecosystem-packs.md](docs/mantle-ecosystem-packs.md).
- **Policy versioning** - off-chain JSON snapshots for review/diff without changing contracts. See
  [docs/policy-versioning.md](docs/policy-versioning.md).

## Examples

```bash
pnpm smoke:examples
```

- [raw-viem](examples/raw-viem/README.md) - firewall between tx build and wallet send
- [agent-framework](examples/agent-framework/README.md) - agent-tool wrapper
- [goat-adapter](examples/goat-adapter/README.md) | [agentkit-adapter](examples/agentkit-adapter/README.md) | [byreal-realclaw-adapter](examples/byreal-realclaw-adapter/README.md) - guarded action providers
- [backend-automation](examples/backend-automation/README.md) - worker integration
- [preflight-api](examples/preflight-api/README.md) - REST reference server

---

## Testing & readiness

```bash
pnpm check                 # build everything (typecheck + web build)
pnpm -r test               # unit tests and package checks across the monorepo
pnpm docs:links            # validate all markdown links
pnpm security:secrets      # scan the tree for committed secrets
pnpm smoke:all             # comprehensive pre-submit gate
pnpm live:full-test        # highest-signal end-to-end product test on Mantle Sepolia
pnpm web:smoke             # dashboard production smoke
pnpm browser:qa            # headless dashboard QA (panels, demo, errors, mobile)
```

`pnpm live:full-test` verifies the policy engine, action simulator, all firewall reason codes, the
Flight Recorder attestations, and reputation counters end-to-end. Submission gates:
`pnpm submission:doctor` / `:live` / `:final`, bundle via `pnpm submission:bundle`.

## Build, ship & CI

CI (`.github/workflows/ci.yml`) runs secret-scan + build + check + test + `smoke:all` on push/PR. Web
deploys via Vercel (`vercel.json`); the indexer via its Dockerfile (Railway/Fly/Render/VM). Full
runbook in [docs/ship-runbook.md](docs/ship-runbook.md) and [docs/deployment.md](docs/deployment.md).

## Limitations

Dev Alpha; Mantle Sepolia only; not audited; no token; no mainnet custody claims. Reputation is a
ratio + tier over simple counters (no time-decay yet). RPC simulation is useful but not a complete
economic risk engine.

Two on-chain boundaries are now **deployed + live** on Mantle Sepolia: **`ActionAttestationV4`**
(`0x69a2ec64285caa68934c4ee1c2f4fab29b08c083`) makes recording require an m-of-n `AttestorCommittee`
(`recordAction` verifies `committee.isApproved(digest, signatures)`) instead of a single attestor — it
is the active attestation contract (`AgentRegistry` is re-pointed to it; verified end-to-end on-chain).
**`TokenGuardedExecutor`** (`0x4ab52cbfaf06afc1058c4bb05d7fb1511df01258`) enforces ERC-20 token rules
(recipient/spender allowlists, max amount, unlimited-approve block) on-chain, not just as advisory
preflight. The single-attestor V3 stays deployed for historical records. **RWA risk stays advisory by
design** — Interlock holds no portfolio/custody, so on-chain exposure enforcement is infeasible. See
[docs/limitations.md](docs/limitations.md) and [docs/threat-model.md](docs/threat-model.md).

---

## Documentation

- [Function Reference (FUNCTIONS.md)](FUNCTIONS.md) - every SDK method, CLI command, MCP tool, REST route, and contract entrypoint in one place.
- [Docs Index](docs/README.md) - recommended navigation map for developers, judges, and release reviewers.

- [Getting Started](docs/getting-started.md) | [Architecture](docs/architecture.md) | [API Reference](docs/api-reference.md) | [Product Logic](docs/product-logic.md)
- [Integration Guide](docs/integration-guide.md) | [MCP Server](docs/mcp.md) | [CLI](docs/cli.md) | [Indexer API](docs/indexer.md) | [REST Preflight API](docs/rest-api.md) | [Adapters](docs/adapters.md) | [Viem Adapter](docs/viem-adapter.md) | [Agent Tool](docs/agent-tool.md)
- [Observability](docs/observability.md) | [Testing](docs/testing.md) | [Ship Runbook](docs/ship-runbook.md) | [Deployment](docs/deployment.md) | [Hosting](docs/hosting.md) | [Environment](docs/environment.md) | [Contract Verification](docs/contract-verification.md)
- [Contracts README](packages/contracts/README.md) | [Web README](apps/web/README.md) | [Agent Demo README](apps/agent-demo/README.md) | [SDK README](packages/sdk/README.md)
- [Policies](docs/policies.md) | [Policy Presets](docs/policy-presets.md) | [Mantle Ecosystem Packs](docs/mantle-ecosystem-packs.md) | [Policy Versioning](docs/policy-versioning.md) | [Simulation](docs/simulation.md) | [Benchmark Arena](docs/benchmark-arena.md)
- [Analytics](docs/analytics.md) | [Webhooks](docs/webhooks.md) | [Examples](docs/examples.md) | [Dashboard Behavior](docs/dashboard-behavior.md) | [Common Mistakes](docs/common-mistakes.md)
- [Threat Model](docs/threat-model.md) | [Audit Readiness](docs/audit-readiness.md) | [Mainnet Runbook](docs/mainnet-runbook.md) | [Limitations](docs/limitations.md) | [Production Roadmap](docs/production-roadmap.md) | [Security Policy](SECURITY.md) | [Changelog](CHANGELOG.md)

## License

MIT
