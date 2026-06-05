import { parseEther, toFunctionSelector, type Address, type Hex } from "viem";
import type { CreatePolicyInput } from "./types.js";
import { assertNonNegativeWei, assertValidAddress, assertValidSelector, assertValidSlippageBps } from "./validation.js";

export type PolicyPreset = {
  name: string;
  description: string;
  maxNativeValue: bigint;
  maxSlippageBps: number;
  targets: Address[];
  selectors: Hex[];
  selectorLabels: Record<string, string>;
  notes: string[];
};

export type PolicyRuleSet = Pick<PolicyPreset, "maxNativeValue" | "maxSlippageBps" | "targets" | "selectors">;

export type PolicyPresetInput = {
  targets: Address[];
  maxNativeValue?: bigint;
  maxSlippageBps?: number;
  extraTargets?: Address[];
  extraSelectors?: Hex[];
};

export const commonSelectors = {
  nativeTransfer: "0x00000000" as Hex,
  erc20Transfer: selector("transfer(address,uint256)"),
  erc20Approve: selector("approve(address,uint256)"),
  erc20TransferFrom: selector("transferFrom(address,address,uint256)"),
  erc20BalanceOf: selector("balanceOf(address)"),
  erc4626Deposit: selector("deposit(uint256,address)"),
  erc4626Mint: selector("mint(uint256,address)"),
  erc4626Redeem: selector("redeem(uint256,address,address)"),
  erc4626Withdraw: selector("withdraw(uint256,address,address)"),
  wethDeposit: selector("deposit()"),
  wethWithdraw: selector("withdraw(uint256)"),
  swapExactTokensForTokens: selector("swapExactTokensForTokens(uint256,uint256,address[],address,uint256)"),
  swapExactETHForTokens: selector("swapExactETHForTokens(uint256,address[],address,uint256)"),
  swapExactTokensForETH: selector("swapExactTokensForETH(uint256,uint256,address[],address,uint256)"),
  addLiquidity: selector("addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)"),
  addLiquidityETH: selector("addLiquidityETH(address,uint256,uint256,uint256,address,uint256)"),
  exactInputSingle: selector("exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))"),
  exactInput: selector("exactInput((bytes,address,uint256,uint256))"),
  uniswapV3Mint: selector("mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))"),
  increaseLiquidity: selector("increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))"),
  decreaseLiquidity: selector("decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))"),
  collectLiquidityFees: selector("collect((uint256,address,uint128,uint128))"),
  testStrategyVaultDepositFor: selector("depositFor(address)"),
  testStrategyVaultWithdraw: selector("withdraw(uint256,address)"),
  testStrategyRouterRouteNativeDeposit: selector("routeNativeDeposit(address,address,uint16)"),
  testStrategyRouterQuoteNativeDeposit: selector("quoteNativeDeposit(address,uint256)"),
};

export function conservativeDeFiPolicy(input: PolicyPresetInput): PolicyPreset {
  return normalizePreset({
    name: "Conservative DeFi Agent",
    description: "Low-spend DeFi policy for vault deposits and tightly scoped swaps.",
    maxNativeValue: input.maxNativeValue ?? parseEther("0.02"),
    maxSlippageBps: input.maxSlippageBps ?? 100,
    targets: [...input.targets, ...(input.extraTargets ?? [])],
    selectors: [
      commonSelectors.erc4626Deposit,
      commonSelectors.erc4626Mint,
      commonSelectors.wethDeposit,
      ...(input.extraSelectors ?? []),
    ],
    selectorLabels: {
      [commonSelectors.erc4626Deposit]: "ERC-4626 deposit",
      [commonSelectors.erc4626Mint]: "ERC-4626 mint",
      [commonSelectors.wethDeposit]: "wrapped native deposit",
    },
    notes: [
      "Use for agents that can allocate small test amounts into approved vault/router contracts.",
      "Does not allow arbitrary token approvals by default.",
    ],
  });
}

export function paymentPolicy(input: PolicyPresetInput): PolicyPreset {
  return normalizePreset({
    name: "Agent Payments",
    description: "Small-value payments to approved recipients or payment contracts.",
    maxNativeValue: input.maxNativeValue ?? parseEther("0.01"),
    maxSlippageBps: input.maxSlippageBps ?? 0,
    targets: [...input.targets, ...(input.extraTargets ?? [])],
    selectors: [commonSelectors.nativeTransfer, commonSelectors.erc20Transfer, ...(input.extraSelectors ?? [])],
    selectorLabels: {
      [commonSelectors.nativeTransfer]: "native transfer",
      [commonSelectors.erc20Transfer]: "ERC-20 transfer",
    },
    notes: [
      "Use for agentic wallets that can pay only known recipients or payment contracts.",
      "Keep targets narrow; every recipient/payment processor should be explicitly allowlisted.",
    ],
  });
}

export function rwaReadOnlyPolicy(input: PolicyPresetInput): PolicyPreset {
  return normalizePreset({
    name: "RWA Read-Only Agent",
    description: "Read-heavy RWA agent policy that allows metadata and balance reads without fund movement.",
    maxNativeValue: input.maxNativeValue ?? 0n,
    maxSlippageBps: input.maxSlippageBps ?? 0,
    targets: [...input.targets, ...(input.extraTargets ?? [])],
    selectors: [
      commonSelectors.erc20BalanceOf,
      selector("allowance(address,address)"),
      selector("asset()"),
      selector("totalAssets()"),
      selector("convertToShares(uint256)"),
      selector("convertToAssets(uint256)"),
      ...(input.extraSelectors ?? []),
    ],
    selectorLabels: {
      [commonSelectors.erc20BalanceOf]: "ERC-20 balanceOf",
      [selector("allowance(address,address)")]: "ERC-20 allowance",
      [selector("asset()")]: "vault asset",
      [selector("totalAssets()")]: "vault totalAssets",
      [selector("convertToShares(uint256)")]: "vault convertToShares",
      [selector("convertToAssets(uint256)")]: "vault convertToAssets",
    },
    notes: [
      "Use for RWA/data agents that should inspect positions but not execute capital movement.",
      "Pair with a separate execution policy if the agent later needs controlled deposits or payments.",
    ],
  });
}

export function approvalPolicy(input: PolicyPresetInput): PolicyPreset {
  return normalizePreset({
    name: "Scoped Token Approvals",
    description: "Narrow approval policy for known spender contracts.",
    maxNativeValue: input.maxNativeValue ?? 0n,
    maxSlippageBps: input.maxSlippageBps ?? 0,
    targets: [...input.targets, ...(input.extraTargets ?? [])],
    selectors: [commonSelectors.erc20Approve, ...(input.extraSelectors ?? [])],
    selectorLabels: {
      [commonSelectors.erc20Approve]: "ERC-20 approve",
    },
    notes: [
      "Use only when the approved token contracts and spender contracts are known.",
      "The MVP contract checks selector and target, not the spender encoded inside calldata.",
    ],
  });
}

export function buildCreatePolicyInput(agentId: bigint, preset: PolicyRuleSet): CreatePolicyInput {
  return {
    agentId,
    maxNativeValue: preset.maxNativeValue,
    maxSlippageBps: preset.maxSlippageBps,
    targets: preset.targets,
    selectors: preset.selectors,
  };
}

export function describePolicyPreset(preset: PolicyPreset) {
  return {
    name: preset.name,
    description: preset.description,
    maxNativeValue: preset.maxNativeValue.toString(),
    maxSlippageBps: preset.maxSlippageBps,
    targets: preset.targets,
    selectors: preset.selectors.map((selectorValue) => ({
      selector: selectorValue,
      label: preset.selectorLabels[selectorValue] ?? "custom selector",
    })),
    notes: preset.notes,
  };
}

export function selector(signature: string): Hex {
  return toFunctionSelector(signature) as Hex;
}

function normalizePreset(preset: PolicyPreset): PolicyPreset {
  assertNonNegativeWei(preset.maxNativeValue, "maxNativeValue");
  assertValidSlippageBps(preset.maxSlippageBps, "maxSlippageBps");
  for (const [index, target] of preset.targets.entries()) {
    assertValidAddress(target, `targets[${index}]`);
  }
  for (const [index, selectorValue] of preset.selectors.entries()) {
    assertValidSelector(selectorValue, `selectors[${index}]`);
  }

  return {
    ...preset,
    targets: unique(preset.targets),
    selectors: unique(preset.selectors),
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
