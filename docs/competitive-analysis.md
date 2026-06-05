# Competitive Analysis: Interlock Control Plane

Interlock started as a Mantle-native pre-flight firewall. The stronger hackathon framing is broader but still focused:

```text
agent proposes action
  -> policy + simulation + risk checks
  -> allow/block
  -> pre-flight attestation
  -> evidence/history
  -> benchmark/reputation
  -> SDK/REST/MCP/CLI/dashboard integration
```

The product category is **Interlock Control Plane for Mantle AI Agents**.

## Why This Matters For Mantle Turing Test

Mantle Turing Test 2026 emphasizes agentic execution, DeFi/RWA actions, Byreal/RealClaw-style agent skills, transparent decision records, and on-chain agent benchmarking. A narrow demo transaction checker is not enough. The stronger product is infrastructure that other Mantle AI agents can integrate before execution.

Primary track:

- `AI DevTools`

Secondary tracks:

- `Agentic Wallets & Economy`
- `AI Trading & Strategy`
- `AI Alpha & Data`
- `AI x RWA`

Sources:

- [Mantle Turing Test PRNewswire](https://www.prnewswire.com/news-releases/mantle-unites-global-ai-tech-and-youth-communities-for-its-largest-ai-hackathon-backed-by-tencent-cloud-bybit-byreal-and-blockchain-for-good-alliance-302750420.html)
- [Byreal RealClaw / ClawHacks PRNewswire](https://www.prnewswire.com/news-releases/bringing-agentic-finance-to-telegram-byreal-debuts-realclaw-transitioning-onchain-finance-to-an-agent-first-economy-302740561.html)

## GitLawb

GitLawb is the best reference for “hackathon project that feels like a complete product.” It is not similar by domain; it is similar by product maturity.

What GitLawb does well:

- product-level narrative, not feature list;
- public site with clear paths for builders, agents, explorers;
- live network/status/explorer surface;
- node/daemon, CLI, MCP tools, docs, releases;
- DID/capability identity story;
- agent-native APIs instead of only human UI;
- strong “why this must exist for agents” framing.

What Interlock should copy:

- live status panel;
- `doctor` checks;
- MCP server;
- public recorder/explorer;
- docs as product, not afterthought;
- installation and integration paths;
- machine-native agent flow.

What Interlock should not copy:

- decentralized git;
- IPFS/libp2p as core scope;
- token/staking;
- GitHub replacement narrative;
- broad network claims we cannot support in Mantle MVP.

Sources:

- [GitLawb site](https://gitlawb.com/)
- [GitLawb agents page](https://gitlawb.com/agents)
- [GitLawb GitHub](https://github.com/Gitlawb)
- [GitLawb repositories](https://github.com/orgs/Gitlawb/repositories)

## Sigil

Sigil is close in category: AI-agent wallet security. It focuses on secured wallets, policy guardrails, templates, session keys, spend caps, and target restrictions.

What Interlock should copy:

- policy guardrail framing;
- strategy templates;
- target and spend restrictions as first-class UX;
- security-focused language;
- API-first integration model.

What Interlock should avoid:

- claiming to be a full wallet;
- claiming production custody safety before audit;
- making session keys or account abstraction mandatory for the MVP.

Our differentiation:

```text
Sigil secures agent wallets.
Interlock is a pre-flight control plane that any wallet/agent framework can call before execution.
```

Source:

- [Sigil Protocol](https://sigil.codes/)

## AAWP

AAWP frames the wallet as AI-exclusive: only the AI agent can be the signer, with identity and cross-chain wallet capabilities.

What Interlock should learn:

- identity has to be visible and verifiable;
- agent wallet products need a strong invariant;
- “agent-owned wallet” is a clear category.

What Interlock should not attempt now:

- AI-only signer enforcement;
- native key custody;
- cross-chain wallet protocol;
- guardian/recovery stack.

Our differentiation:

```text
AAWP answers: who owns/signs the wallet?
Interlock answers: should this proposed transaction be allowed before it is sent?
```

Sources:

- [AAWP](https://aawp.ai/)
- [AAWP docs](https://docs.aawp.ai/)

## AgentKit And GOAT

AgentKit and GOAT-style frameworks give agents wallet access, actions, and protocol tools.

Interlock should integrate as a wrapper:

```text
AgentKit/GOAT give agents hands.
Interlock decides whether those hands may move funds.
```

What to implement:

- raw Viem example;
- GOAT-style guarded tool;
- AgentKit-style action provider;
- MCP server for IDE/agent runtime calls.

What not to do:

- replace those frameworks;
- fork their plugin model;
- build every protocol integration ourselves.

Sources:

- [Coinbase AgentKit](https://github.com/coinbase/agentkit)
- [GOAT SDK](https://github.com/goat-sdk/goat)

## Safe, Rhinestone, ERC-7579

Safe/Rhinestone/ERC-7579 are the long-term smart-account compatibility direction.

What they prove:

- hooks/modules/guards are a real category;
- production-grade wallet safety requires audited modules;
- execution guardrails belong close to the wallet.

What Interlock should do now:

- stay framework-light;
- expose SDK/REST/MCP first;
- keep ERC-7579/Safe guard as roadmap.

Roadmap position:

```text
Dev Alpha: pre-flight SDK/API/MCP + attestor-signed EIP-712 decision receipts.
Public Beta: hosted Recorder API, public package handoff, and external integrator feedback.
Production: smart-account hook/module after audit.
```

Sources:

- [Rhinestone smart accounts](https://docs.rhinestone.dev/home/concepts/smart-accounts)
- [Safe ERC-7579](https://docs.safe.global/advanced/erc-7579/7579-safe)

## Sui Patterns To Borrow

Sui is not the deployment target, but its product patterns are useful.

### Programmable Transaction Blocks

Sui PTBs encourage thinking in action bundles instead of isolated calls. Interlock should evolve toward:

```text
Action Bundle Review = inspect a bundle of proposed calls before execution
```

MVP remains single transaction pre-flight, but Benchmark Arena can describe multi-step risks as scenarios.

### Dry Run / Dev Inspect

Sui tooling treats simulation/inspection as normal developer workflow. Interlock should make Mantle pre-flight feel similarly native:

```text
proposed action -> inspect -> dry-run/simulate -> allow/block -> evidence
```

### zkLogin / Sponsored Transactions

The useful pattern is friction reduction. Interlock should support read-only Judge Demo mode and clear wallet requirements:

- pre-flight works without wallet;
- recording needs wallet/private key;
- no fake history is shown.

### Walrus / Seal

Walrus and Seal show a strong “evidence store” pattern for AI:

- store large/off-chain traces outside the contract;
- anchor hashes on-chain;
- keep sensitive artifacts encrypted or gated.

Interlock equivalent:

- on-chain `simulationHash`;
- off-chain risk report JSON;
- future Evidence Store for prompt/tool trace and simulation trace.

Sources:

- [Sui AI Stack](https://www.sui.io/ai)
- [Sui zkLogin](https://www.sui.io/zklogin)
- [Walrus docs](https://docs.wal.app/)
- [Walrus data security](https://docs.wal.app/docs/data-security)
- [Seal docs](https://seal-docs.wal.app/)

## Product Decision

The product should not become a random collection of features. Every addition has to support the same loop:

```text
action -> check -> decision -> evidence -> reputation
```

Strong additions:

- MCP server;
- public recorder;
- Benchmark Arena;
- Agent Safety Card;
- policy packs by Mantle track;
- status/doctor checks;
- integration snippets.

Weak additions:

- fake integrations;
- fake balances;
- fake history;
- broad AI wallet claims;
- unverified trading bots;
- tokenomics;
- multichain.

## Final Positioning

Interlock Control Plane is for developers building autonomous Mantle agents who need a safety, evidence, and benchmark layer before the agent moves funds.

It is not an AI wallet. It is the layer between an agent framework and wallet execution.
