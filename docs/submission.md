# Interlock — Submission (Mantle / BGA "AI Trading & Strategy")

**One line:** Interlock is the **risk-management + transparency layer that makes AI trading agents safe and auditable** — a pre-flight firewall that checks every agent transaction *before* it is signed, blocks unsafe trades, and records every decision on-chain as tamper-proof evidence. We ship it with a working **AI yield-strategy agent** that trades *through* the firewall on Mantle.

> Status: Dev Alpha, Mantle Sepolia, not audited. Everything below runs end-to-end on real contracts with real data — no mocks.

## The product in one diagram
```
AI strategy agent  →  Interlock pre-flight (policy + simulation + AI risk + RWA guard)
                       →  ALLOW → execute on-chain   →  recorded on-chain (committee-verified)
                       →  BLOCK → reverts / not sent  →  recorded on-chain (with reason)
```
Live demo: dashboard → **Strategy Agent** tab. It reads live DefiLlama Mantle yields, ranks them with a deterministic, explainable strategy (`pickAllocation`), and routes the chosen allocation through the firewall — allocations within limits execute on-chain; an over-budget trade is blocked. Every decision links to its on-chain attestation.

## Part A — Mantle general (50)
| Dimension | Evidence |
| --- | --- |
| **Technical (15)** | 8 contracts live on Mantle Sepolia (AgentRegistry, PolicyRegistry, **ActionAttestationV4** committee-verified recording, PolicyGuardedExecutor, **TokenGuardedExecutor** on-chain ERC-20 rules, DisputeEscrow, AttestorCommittee, ReputationOracle). EIP-712, m-of-n committee, on-chain enforcement, dispute window + bonds/slashing. ~255 tests; hardened (CSP, rate-limit, /metrics, /health, structured logs). |
| **Ecosystem fit (10)** | Mantle-native; official **ERC-8004** "Trustless Agents" registries integrated; **Merchant Moe / Agni / Odos / Fluxion** policy-pack templates; live **DefiLlama** Mantle yields signal. |
| **Business potential (10)** | Clear PMF: safety/compliance infra every autonomous-agent team needs. GTM via SDK / MCP / CLI / REST (drop-in). Revenue: per-attestation / SaaS recorder / enterprise policy packs. See README "Business". |
| **Innovation (10)** | Pre-flight **firewall + committee-verified on-chain attestation** for agent transactions — not a fork; a new safety primitive (CI/CD + flight-recorder for on-chain agents). |
| **UX (5)** | Dark control-plane dashboard, one-request snapshot, streaming demos, plain-language AI explanations. AA/gasless on the roadmap. |

## Part B — BGA AI Trading & Strategy (50)
| Dimension | Evidence |
| --- | --- |
| **BGA ethos (10)** | Transparency, market fairness, and verifiability are the entire thesis: every decision is on-chain, evidence-committed, and disputable. Lowers the trust barrier for retail to use autonomous trading. |
| **Innovation & technical depth (10)** | AI strategy agent (`pickAllocation`) + advisory Claude explanations + firewall stack (policy + simulation + RWA risk + committee attestation). Real Python/Solidity-grade depth, not an API wrapper. |
| **Strategy design & risk management (7.5)** | The strategy is deterministic + explainable (rank by APY × liquidity confidence, skip thin/absurd-APY pools). Risk is enforced, not hoped for: the firewall **blocks** over-budget/over-concentrated/unapproved trades (RWA exposure + concentration + value limits) and proves it live. |
| **Transparency & verifiability (7.5)** | Strongest dimension. Each trade's signal, rationale, decision, and outcome is committed on-chain (`evidenceHash`) and queryable; anyone can audit the agent's full decision history. |
| **Real-world impact (5)** | Solves trust + safety for AI trading — the blocker to retail adoption. Applicable to RWA/yield allocation and underserved users who can't audit a black-box bot. |
| **User accessibility (5)** | Non-institutional users get a readable dashboard + plain-language risk explanations; the firewall removes the need to trust the bot blindly. |
| **Execution & demo (5)** | Working MVP: the Strategy Agent runs live against real DefiLlama data and real contracts, executing + blocking real on-chain trades. |

## What's real (no mocks)
- Signal = live DefiLlama Mantle pools. Venue = a deployed strategy vault/router. Decisions = on-chain attestations (V4 committee). Enforcement = on-chain reverts (guards). Verified end-to-end on Mantle Sepolia.

## Honest limits
Dev Alpha, testnet, unaudited. No CEX/Bybit price trading (would need off-chain price mocks — excluded by design); the strategy is yield-allocation, which uses real on-chain/DefiLlama data. RWA enforcement is advisory off-chain (Interlock holds no custody). See [limitations.md](limitations.md).
