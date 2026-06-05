# GitLawb-Style Interlock Upgrade

This document records the practical GitLawb teardown decisions now implemented in Interlock.

## Product Pattern

GitLawb feels complete because it is not only a UI. It has node runtime, CLI, MCP, identity, contracts, docs, releases, status, and install paths. Interlock applies that pattern to Mantle AI-agent execution:

```text
agent goal -> proposed tx -> pre-flight -> allow/block -> attestation -> benchmark -> public safety card
```

Interlock is not copying GitLawb's decentralized-git, p2p, staking, or bounty model. The borrowed pattern is product maturity and agent-native integration.

## Implemented Surfaces

- Recorder Service: `/health`, `/status`, `/network`, `/agents/:id`, `/agents/:id/actions`, `/benchmark/:agentId`.
- CLI: `init`, `quickstart`, `status`, `whoami`, `benchmark run`, `policy-pack-registry`.
- MCP: status, benchmark, safety card, policy pack creation, policy pack validation, decision explanation.
- SDK: benchmark scenario builder, benchmark runner, official policy pack registry, registry validator.
- Agent runtime: `pnpm agent:benchmark` runs the V2 safety scenario suite through the SDK and prints a judge-ready JSON report.
- Release polish: `pnpm release:pack` creates package tarballs/checksums, and `pnpm release:draft` prints package, gate, checksum, and demo-flow release notes.

## What This Adds For Mantle Turing Test

- A judge can see more than a dashboard form: an agent runner proposes actions and gets evaluated.
- Developers can integrate through SDK, CLI, REST, MCP, or dashboard.
- Benchmark output is based on real policy checks and Mantle Sepolia RPC simulation.
- Public status and safety-card surfaces can be shown without fake history or fake balances.
- Policy packs now have registry metadata, trust tier, aliases, and content hashes.

## Commands

```bash
pnpm build:packages
pnpm cli -- init --out .env.interlock.local
pnpm cli -- status --agent-id <real_agent_id> --policy-id <real_policy_id>
pnpm cli -- benchmark run --agent-id <real_agent_id> --policy-id <real_policy_id>
AGENT_ID=<real_agent_id> POLICY_ID=<real_policy_id> pnpm agent:benchmark
pnpm release:pack
pnpm release:draft
```

Write flows require a Mantle Sepolia test key:

```bash
PRIVATE_KEY=0x... pnpm cli -- quickstart --record
RECORD_DECISIONS=true PRIVATE_KEY=0x... AGENT_ID=<real_agent_id> POLICY_ID=<real_policy_id> pnpm agent:benchmark
```

## What Remains Roadmap

- Full hosted Recorder Service for the public Vercel dashboard.
- Contract verification on Mantlescan.
- Public GitHub release with tarballs/checksums.
- Signed EIP-712 decision receipts.
- ERC-8004-style registry integration.
- Safe/Rhinestone/ERC-7579 module path.
