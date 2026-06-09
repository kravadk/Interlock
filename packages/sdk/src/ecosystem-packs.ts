import type { Hex } from "viem";
import { commonSelectors, selector } from "./presets.js";

export type MantleEcosystemPolicyPack = {
  id: string;
  aliases?: string[];
  name: string;
  description: string;
  trackFit: string[];
  ecosystem: string[];
  mode: "ready" | "template";
  requiredAddresses: string[];
  supportedSelectors: Array<{ selector: Hex; label: string }>;
  maxNativeValue: string;
  maxSlippageBps: number;
  riskNotes: string[];
  judgeHook: string;
  docsUrl?: string;
  /** Product-level guardrail metadata (V2). */
  /** Token addresses the strategy is allowed to touch (descriptive until supplied by the team). */
  allowedTokens?: string[];
  /** Max hops a swap route may take (advisory; surfaced in the UI / capability summary). */
  routeLengthLimit?: number;
  /** Warning shown whenever the pack exposes an `approve` selector. */
  approveWarning?: string;
  /** When true, the pack must not be applied until the integrating team supplies real protocol addresses. */
  requiresRealAddresses?: boolean;
  /** Real production venue addresses (e.g. a mainnet DEX) the pack maps to, when one exists. */
  productionVenue?: {
    network: string;
    lbRouter?: string;
    moeRouter?: string;
    moeFactory?: string;
    lbFactory?: string;
  };
};

export const mantleEcosystemPolicyPacks: MantleEcosystemPolicyPack[] = [
  {
    id: "mantle-basic-agent",
    name: "Mantle Basic Agent",
    description: "Starter policy for safe AgentRegistry reads and zero-value agent demos.",
    trackFit: ["AI DevTools", "Agentic Wallets & Economy"],
    ecosystem: ["Mantle Sepolia", "Interlock contracts"],
    mode: "ready",
    requiredAddresses: ["AgentRegistry address from the current deployment"],
    supportedSelectors: [{ selector: "0x2de5aaf7", label: "AgentRegistry.getAgent(uint256)" }],
    maxNativeValue: "0",
    maxSlippageBps: 0,
    riskNotes: ["Read-oriented pack; it should not be used to authorize fund movement."],
    judgeHook: "Fastest path to show policy, simulation, and on-chain decision attestations.",
  },
  {
    id: "interlock-test-strategy-guard",
    aliases: ["mantle-test-strategy-guard", "test-strategy-guard"],
    name: "Interlock Test Strategy Guard",
    description: "Ready-to-deploy test-contract pack for showing a real guarded deposit through Interlock TestStrategyRouter and TestStrategyVault.",
    trackFit: ["AI DevTools", "AI Trading & Strategy", "AI x RWA", "Agentic Wallets & Economy"],
    ecosystem: ["Mantle Sepolia", "Interlock test strategy contracts"],
    mode: "template",
    requiredAddresses: [
      "TestStrategyRouter deployed by the team",
      "TestStrategyVault deployed by the team",
      "Receiver wallet that owns the resulting test shares",
    ],
    supportedSelectors: [
      { selector: commonSelectors.testStrategyRouterRouteNativeDeposit, label: "TestStrategyRouter.routeNativeDeposit" },
      { selector: commonSelectors.testStrategyRouterQuoteNativeDeposit, label: "TestStrategyRouter.quoteNativeDeposit" },
      { selector: commonSelectors.testStrategyVaultDepositFor, label: "TestStrategyVault.depositFor" },
      { selector: selector("totalAssets()"), label: "TestStrategyVault.totalAssets" },
      { selector: selector("sharesOf(address)"), label: "TestStrategyVault.sharesOf" },
    ],
    maxNativeValue: "0.01 MNT default for demos; team-configured for tests",
    maxSlippageBps: 100,
    riskNotes: [
      "These are Interlock-owned test contracts, not production yield protocols.",
      "Use this pack to prove the full action flow without fake protocol addresses or fake balances.",
      "For real Mantle DeFi/RWA integrations, replace the test contracts with verified protocol addresses and narrower selectors.",
    ],
    judgeHook: "Turns the abstract firewall into a real Mantle Sepolia action: agent proposes a deposit, Interlock preflights it, and the test vault state changes only when allowed.",
  },
  {
    id: "mantle-defi-trading-guard",
    aliases: ["mantle-defi-watcher"],
    name: "Mantle DeFi Trading Guard",
    description: "Template for agents that monitor or execute low-value DeFi actions on approved Mantle venues.",
    trackFit: ["AI Trading & Strategy", "AI Alpha & Data", "AI DevTools"],
    ecosystem: ["Merchant Moe", "Agni Finance", "Fluxion", "Mantle DeFi"],
    mode: "template",
    requiredAddresses: ["Approved DEX/router/vault addresses supplied by the integrating team"],
    supportedSelectors: [
      { selector: commonSelectors.erc20BalanceOf, label: "ERC-20 balanceOf" },
      { selector: commonSelectors.swapExactTokensForTokens, label: "Router swapExactTokensForTokens" },
      { selector: commonSelectors.swapExactETHForTokens, label: "Router swapExactETHForTokens" },
    ],
    maxNativeValue: "team-configured",
    maxSlippageBps: 100,
    riskNotes: [
      "Use narrow allowlists and low value limits.",
      "The pack does not validate route economics beyond configured slippage metadata and RPC simulation.",
    ],
    judgeHook: "Connects Interlock to the hackathon's Mantle DeFi agent narrative without pretending to be a trading bot.",
  },
  {
    id: "generic-mantle-dex-guard",
    aliases: ["mantle-dex-guard", "generic-dex-guard"],
    name: "Generic Mantle DEX Guard",
    description: "Protocol-agnostic guardrail for any Mantle DEX router: narrow target + selector allowlist, low value cap, tight slippage, and a bounded route length.",
    trackFit: ["AI Trading & Strategy", "AI DevTools", "Agentic Wallets & Economy"],
    ecosystem: ["Mantle DeFi", "any verified DEX router"],
    mode: "template",
    requiredAddresses: [
      "Verified DEX router address for the chosen venue",
      "Approved input/output token addresses for the route",
    ],
    supportedSelectors: [
      { selector: commonSelectors.erc20BalanceOf, label: "ERC-20 balanceOf" },
      { selector: commonSelectors.erc20Approve, label: "ERC-20 approve" },
      { selector: commonSelectors.swapExactTokensForTokens, label: "Router swapExactTokensForTokens" },
      { selector: commonSelectors.swapExactETHForTokens, label: "Router swapExactETHForTokens" },
      { selector: commonSelectors.swapExactTokensForETH, label: "Router swapExactTokensForETH" },
    ],
    maxNativeValue: "low team-configured cap",
    maxSlippageBps: 100,
    allowedTokens: ["Supply the exact input/output token addresses for the strategy route"],
    routeLengthLimit: 3,
    approveWarning: "approve grants spending allowance — review the spender and prefer exact-amount approvals, never unlimited.",
    requiresRealAddresses: true,
    riskNotes: [
      "Provide verified router/token addresses before applying.",
      "Keep one router target per policy; do not allow arbitrary routers.",
      "Route length is advisory metadata; the on-chain guard enforces target + selector + value.",
    ],
    judgeHook: "One reusable guardrail any Mantle DEX agent can adopt without a venue-specific pack.",
  },
  {
    id: "odos-router-guard",
    aliases: ["odos-swap-guard", "odos-aggregator-guard"],
    name: "Odos Router Guard",
    description: "Template for agents routing swaps through the Odos aggregator on Mantle: single approved router, approved tokens, tight slippage, and an approve warning.",
    trackFit: ["AI Trading & Strategy", "AI Alpha & Data", "AI DevTools"],
    ecosystem: ["Odos", "Mantle DeFi", "DEX aggregation"],
    mode: "template",
    requiredAddresses: [
      "Verified Odos router address on Mantle",
      "Approved input/output token addresses",
    ],
    supportedSelectors: [
      { selector: commonSelectors.erc20BalanceOf, label: "ERC-20 balanceOf" },
      { selector: commonSelectors.erc20Approve, label: "ERC-20 approve" },
      { selector: selector("swapCompact()"), label: "Odos swapCompact" },
      { selector: selector("swap((address,uint256,address,address,uint256,uint256,address),bytes,address,uint32)"), label: "Odos swap" },
    ],
    maxNativeValue: "low team-configured cap",
    maxSlippageBps: 75,
    allowedTokens: ["Supply the exact tokens the aggregator may route between"],
    routeLengthLimit: 4,
    approveWarning: "Odos pulls tokens via approve — review the router as spender and prefer exact-amount approvals.",
    requiresRealAddresses: true,
    riskNotes: [
      "Verify the exact Odos router selectors/ABI for the deployed version before applying.",
      "Aggregator routes can be long; keep slippage tight and value caps low.",
      "Do not allowlist a generic approve for an unbounded spender.",
    ],
    judgeHook: "Shows Interlock guarding an aggregator path, where route opacity makes a pre-flight policy especially valuable.",
    docsUrl: "https://docs.odos.xyz/",
  },
  {
    id: "merchant-moe-swap-guard",
    aliases: ["merchant-moe-agent-guard", "moe-swap-guard"],
    name: "Merchant Moe Swap Guard",
    description: "Template for agents that propose low-value swaps or liquidity actions on verified Merchant Moe routes.",
    trackFit: ["AI Trading & Strategy", "Agentic Wallets & Economy", "AI DevTools"],
    ecosystem: ["Merchant Moe", "Mantle DeFi", "RealClaw-compatible trading agents"],
    mode: "template",
    // Real Merchant Moe production venue on Mantle mainnet (verified from docs.merchantmoe.com/resources/contracts).
    // The testnet strategy demo routes into the deployed strategy vault because Merchant Moe has no Sepolia
    // deployment; on mainnet the yield-strategy agent would route THROUGH this router, guarded by Interlock.
    productionVenue: {
      network: "Mantle mainnet (5000)",
      lbRouter: "0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a",
      moeRouter: "0xeaEE7EE68874218c3558b40063c42B82D3E7232a",
      moeFactory: "0x5bef015ca9424a7c07b68490616a4c1f094bedec",
      lbFactory: "0xa6630671775c4EA2743840F9A5016dCf2A104054",
    },
    requiredAddresses: [
      "Production router (see productionVenue: Mantle-mainnet Merchant Moe LB Router 0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a) supplied by the integrating team — Merchant Moe has no Sepolia deployment, so the testnet demo uses the strategy vault",
      "Approved token addresses for the exact strategy route",
      "Optional approved liquidity pair/pool addresses if the skill can add liquidity",
    ],
    supportedSelectors: [
      { selector: commonSelectors.erc20BalanceOf, label: "ERC-20 balanceOf" },
      { selector: commonSelectors.erc20Approve, label: "ERC-20 approve" },
      { selector: commonSelectors.swapExactTokensForTokens, label: "Router swapExactTokensForTokens" },
      { selector: commonSelectors.swapExactETHForTokens, label: "Router swapExactETHForTokens" },
      { selector: commonSelectors.swapExactTokensForETH, label: "Router swapExactTokensForETH" },
      { selector: commonSelectors.addLiquidity, label: "Router addLiquidity" },
      { selector: commonSelectors.addLiquidityETH, label: "Router addLiquidityETH" },
    ],
    maxNativeValue: "low team-configured cap",
    maxSlippageBps: 100,
    allowedTokens: ["Approved token addresses for the exact Merchant Moe route"],
    routeLengthLimit: 3,
    approveWarning: "approve grants the router spending allowance — review the spender and prefer exact-amount approvals, never unlimited.",
    requiresRealAddresses: true,
    riskNotes: [
      "Verify the exact Merchant Moe router ABI before applying selectors.",
      "Approvals require spender-level review outside the current MVP selector/target model.",
      "Keep strategy routes narrow; do not allow a generic router target for every agent action.",
    ],
    judgeHook: "Shows Interlock can sit directly in front of the Mantle DEX venue highlighted by the hackathon without claiming to be the trading strategy.",
    docsUrl: "https://docs.merchantmoe.com/dex-features/trading",
  },
  {
    id: "agni-clmm-guard",
    aliases: ["agni-finance-guard", "agni-swap-guard"],
    name: "Agni Concentrated Liquidity Guard",
    description: "Template for agents that propose swaps or concentrated-liquidity adjustments through verified Agni/Uniswap-v3-style periphery contracts.",
    trackFit: ["AI Trading & Strategy", "AI DevTools"],
    ecosystem: ["Agni Finance", "Mantle DeFi", "concentrated liquidity"],
    mode: "template",
    requiredAddresses: [
      "Verified Agni swap router or position manager address supplied by the integrating team",
      "Approved token addresses and fee tiers for the strategy",
      "Position NFT manager address if the agent can adjust liquidity",
    ],
    supportedSelectors: [
      { selector: commonSelectors.erc20BalanceOf, label: "ERC-20 balanceOf" },
      { selector: commonSelectors.erc20Approve, label: "ERC-20 approve" },
      { selector: commonSelectors.exactInputSingle, label: "CLMM exactInputSingle" },
      { selector: commonSelectors.exactInput, label: "CLMM exactInput" },
      { selector: commonSelectors.uniswapV3Mint, label: "CLMM mint position" },
      { selector: commonSelectors.increaseLiquidity, label: "CLMM increaseLiquidity" },
      { selector: commonSelectors.decreaseLiquidity, label: "CLMM decreaseLiquidity" },
      { selector: commonSelectors.collectLiquidityFees, label: "CLMM collect fees" },
    ],
    maxNativeValue: "low team-configured cap",
    maxSlippageBps: 75,
    allowedTokens: ["Approved token addresses and fee tiers for the Agni strategy"],
    routeLengthLimit: 2,
    approveWarning: "approve grants the position manager/router spending allowance — review the spender and prefer exact-amount approvals.",
    requiresRealAddresses: true,
    riskNotes: [
      "Concentrated liquidity requires extra range, fee-tier, and position-id checks outside the current MVP contract model.",
      "Use this as a guardrail template, not a full strategy risk engine.",
      "Separate read/quote actions from liquidity-changing actions when possible.",
    ],
    judgeHook: "Covers the concentrated-liquidity side of Mantle DeFi and makes Interlock useful for more than simple swaps.",
    docsUrl: "https://agni.finance/",
  },
  {
    id: "fluxion-rwa-spot-guard",
    aliases: ["fluxion-spot-guard", "fluxion-rwa-guard"],
    name: "Fluxion RWA Spot Guard",
    description: "Template for agents that route RWA/spot-liquidity actions through verified Fluxion-style targets on Mantle.",
    trackFit: ["AI x RWA", "AI Trading & Strategy", "AI DevTools"],
    ecosystem: ["Fluxion", "Mantle RWA", "spot liquidity"],
    mode: "template",
    requiredAddresses: [
      "Verified Fluxion spot/router/vault target supplied by the integrating team",
      "Approved RWA or structured-asset token addresses",
      "Approved quote/read targets for liquidity, balances, and exposure checks",
    ],
    supportedSelectors: [
      { selector: commonSelectors.erc20BalanceOf, label: "ERC-20 balanceOf" },
      { selector: selector("totalAssets()"), label: "Vault/market totalAssets" },
      { selector: selector("asset()"), label: "Vault/market asset" },
      { selector: commonSelectors.swapExactTokensForTokens, label: "Spot router swapExactTokensForTokens" },
      { selector: commonSelectors.erc4626Deposit, label: "ERC-4626 deposit" },
      { selector: commonSelectors.erc4626Withdraw, label: "ERC-4626 withdraw" },
    ],
    maxNativeValue: "team-configured; start read-only",
    maxSlippageBps: 50,
    riskNotes: [
      "Start read-only for RWA/spot assets; enable deposit/swap/withdraw selectors only after target verification.",
      "Interlock does not verify issuer, KYC, redemption, or off-chain asset risk.",
      "Use separate policies for read-only monitoring and capital-moving actions.",
    ],
    judgeHook: "Connects AI x RWA and DeFi execution through one safety layer while staying honest about off-chain RWA risks.",
    docsUrl: "https://fluxion.network/",
  },
  {
    id: "ai-alpha-execution-guard",
    name: "AI Alpha Execution Guard",
    description: "Template for alpha bots that can publish alerts freely, but must pass policy checks before execution.",
    trackFit: ["AI Alpha & Data", "AI DevTools", "AI Trading & Strategy"],
    ecosystem: ["Nansen-style smart money tracking", "Elfa AI-style social signals", "Mantle execution"],
    mode: "template",
    requiredAddresses: ["Approved execution targets; alert-only bots can leave execution targets empty"],
    supportedSelectors: [
      { selector: commonSelectors.erc20BalanceOf, label: "ERC-20 balanceOf" },
      { selector: commonSelectors.swapExactTokensForTokens, label: "Router swapExactTokensForTokens" },
      { selector: commonSelectors.swapExactETHForTokens, label: "Router swapExactETHForTokens" },
    ],
    maxNativeValue: "low team-configured cap",
    maxSlippageBps: 75,
    riskNotes: [
      "Alpha generation and execution should be separated.",
      "Alerts can be off-chain; any transaction created from an alert must pass target, selector, spend, slippage, and simulation checks.",
    ],
    judgeHook: "Shows how alpha agents can graduate from signal generation to controlled Mantle execution.",
  },
  {
    id: "mantle-rwa-yield-guard",
    aliases: ["mantle-rwa-guard"],
    name: "RWA Yield Guard",
    description: "Template for mETH/USDY-like RWA or yield agents that need stricter movement limits and read-heavy checks.",
    trackFit: ["AI x RWA", "AI DevTools"],
    ecosystem: ["mETH Protocol", "Ondo USDY", "Mantle RWA"],
    mode: "template",
    requiredAddresses: ["Approved vault/token/adapter addresses supplied by the integrating team"],
    supportedSelectors: [
      { selector: commonSelectors.erc20BalanceOf, label: "ERC-20 balanceOf" },
      { selector: selector("asset()"), label: "ERC-4626 asset()" },
      { selector: selector("totalAssets()"), label: "ERC-4626 totalAssets()" },
      { selector: commonSelectors.erc4626Deposit, label: "ERC-4626 deposit" },
    ],
    maxNativeValue: "team-configured",
    maxSlippageBps: 50,
    riskNotes: [
      "Start read-only; enable deposit selectors only after addresses are confirmed.",
      "No KYC, document verification, or issuer risk scoring is implied.",
    ],
    judgeHook: "Shows how Interlock can protect RWA/yield agents without building a full RWA platform.",
  },
  {
    id: "byreal-realclaw-adapter-template",
    aliases: ["byreal-realclaw-adapter"],
    name: "Byreal / RealClaw Adapter Pack",
    description: "Template for wrapping a Byreal/RealClaw-style skill before it sends an on-chain action.",
    trackFit: ["Agentic Wallets & Economy", "AI Trading & Strategy"],
    ecosystem: ["Byreal", "RealClaw", "OpenClaw-style skills"],
    mode: "template",
    requiredAddresses: ["Skill-produced target addresses and selectors reviewed by the developer"],
    supportedSelectors: [
      { selector: commonSelectors.erc20BalanceOf, label: "ERC-20 balanceOf" },
      { selector: commonSelectors.erc20Approve, label: "ERC-20 approve" },
      { selector: commonSelectors.swapExactTokensForTokens, label: "Router swapExactTokensForTokens" },
    ],
    maxNativeValue: "team-configured",
    maxSlippageBps: 100,
    riskNotes: [
      "This is an adapter boundary, not a full RealClaw implementation.",
      "Approval selectors require spender-level review outside the current MVP contract model.",
    ],
    judgeHook: "Directly maps Interlock to the hackathon's agentic economy and Byreal Skills story.",
  },
  {
    id: "agent-wallet-spending-constitution",
    aliases: ["agentic-payments"],
    name: "Agent Wallet Spending Constitution",
    description: "Template for small recurring payments to approved recipients or payment processors.",
    trackFit: ["Agentic Wallets & Economy", "Consumer & Viral DApps"],
    ecosystem: ["Mantle payments", "UR-style smart money flows"],
    mode: "template",
    requiredAddresses: ["Approved recipient, stablecoin, or payment processor addresses"],
    supportedSelectors: [
      { selector: commonSelectors.nativeTransfer, label: "Native transfer" },
      { selector: commonSelectors.erc20Transfer, label: "ERC-20 transfer" },
    ],
    maxNativeValue: "low team-configured cap",
    maxSlippageBps: 0,
    riskNotes: [
      "Use narrow recipients and conservative per-action limits.",
      "Daily caps are a roadmap policy extension, not enforced by the current MVP contracts.",
    ],
    judgeHook: "Makes the safety layer understandable for non-trading autonomous agents.",
  },
  {
    id: "consumer-safe-mode",
    name: "Consumer Safe Mode",
    description: "Template for consumer-facing agent actions where the UI should hide raw calldata and explain every block in plain language.",
    trackFit: ["Consumer & Viral DApps", "Agentic Wallets & Economy", "AI DevTools"],
    ecosystem: ["Mantle consumer apps", "UR-style smart money flows", "agent-assisted UX"],
    mode: "template",
    requiredAddresses: ["Approved consumer app contracts, payment recipients, or testnet demo contracts"],
    supportedSelectors: [
      { selector: commonSelectors.nativeTransfer, label: "Native transfer" },
      { selector: commonSelectors.erc20Transfer, label: "ERC-20 transfer" },
      { selector: commonSelectors.erc20BalanceOf, label: "ERC-20 balanceOf" },
    ],
    maxNativeValue: "very low team-configured cap",
    maxSlippageBps: 0,
    riskNotes: [
      "Consumer mode should prefer clear allow/block explanations over raw protocol detail.",
      "No fake balances or fake transfers; demo actions must use real testnet contracts or explicit test contracts.",
    ],
    judgeHook: "Lets judges understand the same firewall through a consumer-safe narrative without changing the core product.",
  },
];

export function listMantleEcosystemPolicyPacks() {
  return mantleEcosystemPolicyPacks;
}

export function getMantleEcosystemPolicyPack(id: string) {
  return mantleEcosystemPolicyPacks.find((pack) => pack.id === id || pack.aliases?.includes(id));
}
