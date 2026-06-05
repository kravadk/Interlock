# Competitive Landscape

This document explains what Interlock Firewall should learn from similar products and where it should stay different.

## 1. Positioning In One Sentence

Interlock Firewall is the pre-flight policy, simulation, and on-chain audit layer for AI-agent transactions on Mantle.

It should integrate with agent toolkits and wallets, not replace them.

## 2. Similar Products

| Product | What it does well | Target user | Overlap with Interlock Firewall | Gap Interlock should fill |
| --- | --- | --- | --- | --- |
| Coinbase AgentKit | Gives AI agents wallets, action providers, and on-chain capabilities. | Agent developers. | Agents need a wallet and action framework before they can propose transactions. | AgentKit gives agents hands; Interlock decides whether those hands may move funds. |
| GOAT SDK | Large agentic finance toolkit with tools, chain/wallet integrations, and agent-framework adapters. | Agent developers and finance agent teams. | GOAT-style tools can produce transaction intents. | Interlock should wrap those intents with policy, simulation, attestation, and history. |
| Tenderly | Deep simulation, debugging, gas profiling, monitoring, and transaction inspection. | Smart contract and dapp developers. | Interlock needs transaction simulation and good debug output. | Interlock is not a general simulator; it turns simulation into an agent policy decision and writes the decision on-chain. |
| Blockaid | Transaction security and threat detection for wallets/dapps. | Wallets, dapps, end users. | Both inspect transactions before execution. | Interlock is agent/developer-oriented, policy-governed, Mantle-native, and focused on auditable agent behavior. |
| Blowfish | Wallet transaction/message simulation and security UX. | Wallets and end users. | Both improve pre-signing safety. | Interlock focuses on autonomous agents, policy IDs, agent IDs, reason codes, and on-chain decision attestations. |
| Safe Guards / Modules | Smart-account level checks before and after Safe transactions; modules extend wallet behavior. | Safe account builders and advanced wallet teams. | Similar "guard before execution" concept. | Interlock starts as a lightweight SDK/API/contracts layer instead of requiring a full Safe or smart-account migration. |
| Rhinestone / ERC-7579 ecosystem | Modular smart-account interoperability and modules. | Smart-account developers. | Future Interlock policy checks could become modules. | Current Interlock is easier for hackathon and testnet agent teams: no account abstraction migration required. |
| OpenZeppelin Defender / Monitor | Developer security operations, monitoring, relayers, alerts, and operational workflows. | Protocol teams and operators. | Interlock needs the same "developer operations console" mindset. | Interlock narrows this to AI-agent transaction pre-flight, policies, and Mantle attestations. |

## 3. What To Copy From These Products

### From AgentKit and GOAT

Copy the integration mindset:

- simple package install;
- short code snippet;
- examples for popular agent runtimes;
- adapters that do not force teams to rewrite existing agents;
- clear separation between "agent proposes action" and "runtime executes action".

Do not copy:

- becoming a giant action marketplace;
- adding 100 integrations before the core policy flow is sharp.

### From Tenderly

Copy the debugging quality:

- simulation status;
- revert reason when available;
- gas / execution metadata later;
- structured error output;
- shareable transaction inspection.

Do not copy:

- trying to become a full transaction debugger;
- building a huge custom simulation platform before the policy product is clear.

### From Blockaid and Blowfish

Copy the safety UX:

- "before signing" framing;
- clear risk labels;
- human-readable reason;
- no silent failures;
- obvious blocked state.

Do not copy:

- broad consumer wallet security claims;
- claiming to detect every malicious contract;
- hiding the decision logic behind an opaque risk score.

### From Safe and Rhinestone

Copy the execution guard concept:

- pre-execution checks;
- post-execution hooks in roadmap;
- modular policy packs;
- eventual smart-account compatibility.

Do not copy for MVP:

- full ERC-4337 account stack;
- Safe module implementation as the primary product;
- complex wallet migration flow.

### From OpenZeppelin Defender

Copy the DevOps product shape:

- dashboard as an operations console;
- monitors and health checks;
- clear environment setup;
- logs and historical activity;
- runbooks and checklists.

Do not copy:

- broad protocol operations scope;
- enterprise workflow complexity too early.

## 4. The Product Category

The clean category is:

> Interlock Firewall is CI/CD for autonomous on-chain actions.

This category is stronger than "AI wallet security" because it makes the product role obvious:

- agents propose actions;
- the firewall runs checks;
- only passing actions execute;
- all decisions are logged.

## 5. Final Differentiation

Interlock Firewall should be judged on five things:

1. It is agent-specific.
   - It has `agentId`, `policyId`, reason codes, decision history, and reputation counters.

2. It is Mantle-native.
   - It deploys to Mantle Sepolia and uses Mantle events as the audit trail.

3. It is developer-first.
   - SDK, REST API, CLI, dashboard, examples, and docs all support integration.

4. It is deterministic.
   - Policy checks are explicit and debuggable, not just a black-box AI score.

5. It is narrow enough to ship.
   - It avoids full wallet, full trading bot, full RWA platform, tokenomics, and multichain scope.

## 6. What To Add To Our Product Next

Highest-value additions:

1. Public hosted dashboard.
   - Judges and developers should be able to open it without running locally.

2. Contract verification on Mantlescan.
   - Required for the DoraHacks deployment award and improves trust.

3. A sharper Action Review screen.
   - It should read like a pipeline result: proposed action, checks, final decision, attestation.

4. AgentKit/GOAT example adapters.
   - Not full integrations, just minimal wrappers proving "drop this before execution".

5. Better simulation output.
   - Show revert reason, simulation hash, maybe gas estimate when available.

6. Policy presets for common agent types.
   - Conservative DeFi Agent.
   - Read-only Research Agent.
   - Payment Agent.
   - RWA Observer Agent.

7. Final submission URLs.
   - GitHub repo.
   - Hosted dashboard.
   - Demo video.

## 7. References

- Coinbase AgentKit: https://github.com/coinbase/agentkit
- GOAT SDK: https://github.com/goat-sdk/goat
- Tenderly docs: https://docs.tenderly.co/
- Blockaid Transaction Security: https://www.blockaid.io/transaction-security
- Blowfish: https://blowfish.xyz/
- Safe Guards: https://docs.safe.global/advanced/smart-account-guards
- Safe Modules: https://docs.safe.global/advanced/smart-account-modules
- ERC-7579 Module SDK overview: https://erc7579.com/tooling/module-sdk
- Rhinestone ERC-7579 overview: https://www.rhinestone.dev/blog/introducing-erc-7579-417084d7a66f
- OpenZeppelin Defender docs: https://docs.openzeppelin.com/defender/
