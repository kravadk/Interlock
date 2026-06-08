# Interlock — 90-second demo script

Goal: show an **AI trading/strategy agent that is safe and auditable because it trades through Interlock**. Everything is live on Mantle Sepolia with real data.

## Setup (once, before the demo)
1. `pnpm install && pnpm build:packages`
2. Deploy the strategy venue (the allocation target): `DEPLOY_TEST_STRATEGY_CONTRACTS=true` deploy, then set `TEST_STRATEGY_ROUTER` + `TEST_STRATEGY_VAULT`.
3. Allowlist the router + `routeNativeDeposit` selector in the demo policy (Policies tab or CLI `target-allow` / `selector-allow`).
4. Set server env: `PRIVATE_KEY`, `AGENT_ID`, `POLICY_ID`. Run `pnpm dev`, open the dashboard.

## Script
**0:00 — The problem (10s).** "AI agents now trade with their own wallets. If the agent is wrong or hijacked, the money is already gone. Interlock is a pre-flight firewall: it checks every trade *before* it's signed and records the decision on-chain."

**0:10 — The strategy agent (15s).** Open the **Strategy Agent** tab. "This agent reads *live* Mantle yields from DefiLlama and ranks them with a transparent strategy — APY weighted by liquidity, skipping thin or absurd-APY pools. No black box." Point at the **Live yield signal** panel (real pools, risk flags).

**0:25 — Safe trade ALLOWED + executed (20s).** Press **Run strategy agent**. Step 1 = a risk-sized allocation. "The agent proposes depositing into the best pool. Interlock pre-flights it — policy + simulation + RWA concentration check — it's within limits, so it **executes on-chain** and records the decision." Click the **tx** link → Mantle explorer.

**0:45 — Bad trade BLOCKED + recorded (20s).** Step 2 = the agent tries to allocate 20× the budget. "Now the agent goes greedy. Interlock **blocks** it before it's signed — `VALUE_LIMIT_EXCEEDED` — and still records the blocked attempt as tamper-proof evidence." Show the red BLOCK row + its on-chain record.

**1:05 — Verifiability (15s).** Open the **Recorder** tab. "Every decision — allowed and blocked — is an on-chain attestation anyone can audit. The committee (m-of-n) verifies each recording. This is what makes an AI trading agent *trustworthy*: not 'trust the bot', but 'verify every move'."

**1:20 — Close (10s).** "Interlock is the risk-management + transparency layer for AI trading on Mantle. The strategy agent is the proof; the firewall is the product. Drop-in via SDK, MCP, CLI, or REST."

## Fallback (no venue deployed)
If the strategy venue isn't deployed, the Strategy tab shows a clear config hint. Use the **Agent Demo** tab instead (benchmark scenarios: safe + adversarial), which records ALLOW/BLOCK decisions on-chain with no extra setup — the same firewall + audit story.
