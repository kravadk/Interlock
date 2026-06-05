# Competitive Gap Analysis

Interlock is positioned as a Mantle Agent Safety and Benchmark Control Plane. The core loop stays narrow:

```text
agent proposes action or bundle
-> Interlock checks policy, calldata, simulation, token/RWA metadata
-> allow or block
-> proposal lifecycle
-> on-chain evidence
-> recorder, analytics, safety card, SDK/CLI/MCP integration
```

This document explains what was added after comparing Interlock with Mantle and hackathon-adjacent projects.

## Reference Patterns

| Reference | Strong pattern | Interlock gap | Implemented response |
| --- | --- | --- | --- |
| YieldApe | Multi-step DeFi routes and cross-chain strategy thinking | Single transaction review only | Action Bundle Review in SDK and integration snippets |
| Reputable.ai | Investor-facing trust and research workflow | Safety counters needed stronger identity bridge | ERC-8004 manifest and optional identity adapter |
| Foundra | RWA state machine and risk evidence | RWA packs were mostly templates | RWA risk evidence builder and live yield/RWA signal sync |
| LeapVault | Agent proposals, approvals, alerts, marketplace-like workflow | No persisted proposal lifecycle | Recorder Action Proposals API and dashboard lifecycle timeline |
| mantle-ai-agent | Goal-driven agent runner and transparent reasoning | Agent demo was closer to a script than a workflow | Agent Goal Runner with proposal -> bundle -> preflight -> optional record |
| Mosaic | Contract generation and ABI-driven developer UX | Policy authoring required manual selector work | ABI -> Policy Pack Builder and CLI generator |
| Payce | Consumer-grade transaction safety around payment primitives | Token calldata checks were generic selector checks | Token Transfer Guard for transfer, transferFrom, approve |
| create-mantle-dapp | Fast starter onboarding | No generated starter path | `init-agent-app` CLI generator |

## Implemented Product Additions

### Action Proposal Lifecycle

Recorder Service now supports persisted action proposals:

- `POST /proposals`
- `GET /proposals`
- `GET /proposals/:id`
- `POST /proposals/:id/preflight`
- `POST /proposals/:id/mark-executed`
- `POST /proposals/:id/record`

The dashboard shows a Proposal Lifecycle block in Action Review and Flight Recorder. If the dashboard is using RPC fallback, proposals stay empty instead of showing synthetic lifecycle rows. The Recorder API also rejects invalid lifecycle transitions such as `blocked -> executed` or `rejected -> recorded`.

### Action Bundle Review

The SDK now exposes bundle helpers:

- `checkActionBundle`
- `recordBundleDecisions`
- `summarizeBundleRisk`

Bundle review does not execute cross-chain routes or fake DeFi actions. It checks each real proposed transaction independently and marks the bundle as allowed only when all required actions pass. The dashboard includes a Bundle Review block in Action Review and a multi-step bundle scenario in Benchmark Arena.

### Token Transfer Guard

The SDK can decode ERC-20:

- `transfer`
- `transferFrom`
- `approve`

It can block:

- recipients outside an allowlist;
- spenders outside an allowlist;
- amounts above a cap;
- unlimited approvals unless explicitly allowed.

These are off-chain preflight checks for developer safety. The dashboard surfaces ERC-20 calldata evidence for `approve`, `transfer`, and `transferFrom`. The current deployed contracts still enforce target, selector, native value and attestation logic.

### ERC-8004 Adapter

Interlock now has optional ERC-8004 helpers:

- build an ERC-8004-style manifest for an Interlock agent;
- read a configured identity registry;
- build MCP/dashboard service links.

No unverified ERC-8004 registry address is hardcoded. Developers must pass a registry address or configure `ERC8004_IDENTITY_REGISTRY` / `NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY`. The Agent Safety Card shows a real registry link only when configured; otherwise it shows the manifest and an explicit unconfigured state.

### Mantle Yield / RWA Signals

Recorder Service can fetch read-only yield data from the configured public source and expose it through:

- `GET /ecosystem/yields`
- `POST /ecosystem/yields/sync`

Dashboard shows the loaded records in the Developer Integration / Ecosystem area and uses them as advisory evidence in Action Review. If the source is unavailable or not synced, the UI shows an explicit empty state.

### RWA Risk Evidence

The SDK can build a hashable advisory evidence report from:

- portfolio context supplied by the integrating app;
- RWA guard config;
- yield data;
- thresholds for TVL, APY and freshness.

This supports the `AI x RWA` narrative without pretending to be a full RWA platform.

### ABI -> Policy Pack Builder

Developers can generate a policy pack template from a real contract address and ABI:

```bash
pnpm cli -- policy-pack-from-abi --address 0x... --abi ./abi.json --out policies/generated.json
```

The generated pack stays in template mode. It still requires human review before applying on-chain. The dashboard Policy tab also includes a Build From ABI panel with selector preview and copyable JSON output.

### Agent Goal Runner

`apps/agent-demo` now supports a goal-based runner:

```bash
pnpm --filter @interlock/agent-demo goal -- --goal "review Mantle agent action"
```

The runner creates an agent action bundle, runs preflight, optionally records decisions, prints dashboard / safety-card links, and persists a real proposal lifecycle when `RECORDER_URL` or `INDEXER_URL` is configured.

### Starter Generator

The CLI can generate a minimal Viem/AgentKit/GOAT-style starter:

```bash
pnpm cli -- init-agent-app --out ./my-agent --template viem
```

The generated starter includes env docs, a safe preflight, a blocked preflight and no copied private key.

## What Was Deliberately Not Added

- No fake protocol addresses.
- No fake balances, fake history or fake transactions.
- No full wallet implementation.
- No real trading bot.
- No RWA custody or document platform.
- No cross-chain bridge implementation.
- No mainnet or production-security claim.
- No unverified official registry address.

## Product Impact

These additions make Interlock closer to a developer product:

- agents can have a proposal lifecycle;
- DeFi/RWA/payment actions can carry richer risk evidence;
- developers can generate policy packs from real ABIs;
- AI-agent runtimes can use SDK, CLI, REST or MCP;
- judges can see safety, transparency, benchmark and Mantle integration in one flow.
