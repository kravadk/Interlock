# Mantle Ecosystem Packs

Mantle ecosystem packs are developer-facing templates for turning Interlock Control Plane into a product workflow instead of a blank policy form.

They do not hardcode unverified protocol addresses. A pack is either:

- `ready`: works with the current Interlock deployment, such as the basic AgentRegistry read pack;
- `template`: describes the Mantle ecosystem target, selectors, risk notes, and required real addresses that an integrating team must provide.

List packs from CLI:

```bash
pnpm cli -- policy-pack --list
```

## Packs

### Mantle Basic Agent

Track fit: `AI DevTools`, `Agentic Wallets & Economy`

Use this for a first live demo: select a real agent/policy, call `AgentRegistry.getAgent(uint256)`, run preflight, and optionally record the decision attestation.

Why judges care: it shows the core product loop quickly without fake addresses or fake transactions.

### Interlock Test Strategy Guard

Track fit: `AI DevTools`, `AI Trading & Strategy`, `AI x RWA`, `Agentic Wallets & Economy`

Use this when the project needs a real Mantle Sepolia execution flow without claiming a production protocol integration. The team deploys `TestStrategyVault` and `TestStrategyRouter`, allowlists the router target plus `routeNativeDeposit(address,address,uint16)`, then runs a native-value deposit through Interlock.

What it proves:

- the agent proposes a real transaction to a real deployed contract;
- the firewall checks target, selector, spend, slippage metadata, and RPC simulation;
- an allowed action can change test vault state;
- a blocked action can be recorded as evidence without sending funds;
- no fake balances, fake transactions, or fake protocol addresses are needed.

Required config:

- `TEST_STRATEGY_VAULT`
- `TEST_STRATEGY_ROUTER`
- `NEXT_PUBLIC_TEST_STRATEGY_VAULT`
- `NEXT_PUBLIC_TEST_STRATEGY_ROUTER`

Deploy the optional test contracts with:

```bash
DEPLOY_TEST_STRATEGY_CONTRACTS=true pnpm --filter @interlock/contracts deploy
```

Why judges care: it turns the abstract safety layer into a visible Mantle action while keeping the product honest about not being a real DEX, RWA vault, or yield protocol.

### Mantle DeFi Trading Guard

Track fit: `AI Trading & Strategy`, `AI Alpha & Data`, `AI DevTools`

Template for Merchant Moe, Agni, Fluxion, or another approved Mantle DeFi venue. The integrating team supplies real router/vault addresses and keeps value/slippage limits conservative.

Why judges care: it connects the firewall to Mantle's agent trading narrative without pretending to be a full trading bot.

### Merchant Moe Swap Guard

Track fit: `AI Trading & Strategy`, `Agentic Wallets & Economy`, `AI DevTools`

Template for agents that propose low-value swaps or liquidity actions on verified Merchant Moe routes. The pack includes common swap/liquidity selectors, but it requires the integrating team to supply and verify the exact Merchant Moe router or Liquidity Book router address before applying it.

Why judges care: it gives Interlock a concrete Mantle DEX integration path while keeping the project honest about not hardcoding unverified protocol addresses.

### Agni Concentrated Liquidity Guard

Track fit: `AI Trading & Strategy`, `AI DevTools`

Template for agents that propose swaps or liquidity-position changes through verified Agni/Uniswap-v3-style contracts. The pack includes common exact-input, mint, increase/decrease liquidity, and collect selectors. It also warns that range, fee-tier, and position-id risk checks are outside the current MVP contract model.

Why judges care: it covers concentrated-liquidity workflows, not only simple router swaps.

### Fluxion RWA Spot Guard

Track fit: `AI x RWA`, `AI Trading & Strategy`, `AI DevTools`

Template for Fluxion-style spot/RWA liquidity agents. It starts from read-heavy selectors and can be extended with verified spot router or ERC-4626-style target addresses supplied by the team.

Why judges care: it bridges the hackathon's DeFi and RWA narratives through one pre-flight safety layer.

### AI Alpha Execution Guard

Track fit: `AI Alpha & Data`, `AI DevTools`, `AI Trading & Strategy`

Template for agents that can publish alerts freely, but must pass Interlock before converting a signal into execution.

Why judges care: it connects data/alpha agents to controlled Mantle execution, which is stronger than an alert-only bot.

### RWA Yield Guard

Track fit: `AI x RWA`, `AI DevTools`

Template for mETH/USDY-like yield or RWA agents. Start read-only, then allow execution selectors only after the vault/token addresses are confirmed.

Why judges care: it keeps the project focused on agent safety while still aligning with Mantle's on-chain finance and RWA direction.

### Byreal / RealClaw Adapter Pack

Track fit: `Agentic Wallets & Economy`, `AI Trading & Strategy`

Template for the boundary where a Byreal/RealClaw-style skill proposes an action and Interlock runs policy/simulation checks before wallet execution.

Why judges care: the hackathon explicitly highlights Byreal/RealClaw-style agent execution, and this gives Interlock a clean integration story.

### Agent Wallet Spending Constitution

Track fit: `Agentic Wallets & Economy`, `Consumer & Viral DApps`

Template for small recurring payments to approved recipients or processors. Daily caps are a roadmap extension; the current MVP enforces per-action value and selector/target allowlists.

Why judges care: it shows the firewall is useful beyond trading.

### Consumer Safe Mode

Track fit: `Consumer & Viral DApps`, `Agentic Wallets & Economy`, `AI DevTools`

Template for consumer-facing agent actions where the app should explain allow/block in plain language and hide raw calldata until the developer asks for details.

Why judges care: it makes the same safety layer understandable for non-dev flows without adding fake consumer transactions.

## Dashboard Usage

Open the dashboard and use:

- `Start Here` for setup readiness.
- `Judge Demo` for safe/risky one-click scenarios.
- `Mantle Ecosystem` for links, deployed contracts, env copy, and pack summaries.
- `Developer Integration` for SDK, REST, MCP, CLI, GOAT-style, AgentKit-style, env, and policy pack snippets.

## Safety Rules

- Do not use fake protocol addresses.
- Do not enable broad approvals without extra spender-level checks.
- Do not pitch pack metadata as an audit.
- Treat template packs as integration guides until real addresses are configured and tested.
