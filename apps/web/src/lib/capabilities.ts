// Human-readable selector labels + capability sentences for the policy UI. Turns a raw
// allowlist (targets, selectors, value/slippage caps) into "Agent can / cannot …" language
// and flags the approve risk.

export const SELECTOR_LABELS: Record<string, string> = {
  "0x095ea7b3": "approve",
  "0xa9059cbb": "transfer",
  "0x23b872dd": "transferFrom",
  "0x70a08231": "balanceOf",
  "0xd0e30db0": "deposit",
  "0x2e1a7d4d": "withdraw",
  "0x2de5aaf7": "getAgent",
  "0x38ed1739": "swapExactTokensForTokens",
  "0x7ff36ab5": "swapExactETHForTokens",
  "0x18cbafe5": "swapExactTokensForETH",
  "0xe8e33700": "addLiquidity",
  "0xf305d719": "addLiquidityETH",
  "0x414bf389": "exactInputSingle",
  "0xc04b8d59": "exactInput",
  "0x6a627842": "mint",
  "0xb6b55f25": "deposit(uint256)",
};

export const APPROVE_SELECTOR = "0x095ea7b3";

/** Human label for a selector, falling back to the raw selector itself. */
export function selectorLabel(selector: string): string {
  return SELECTOR_LABELS[selector.toLowerCase()] ?? selector;
}

export type CapabilitySummary = {
  can: string[];
  cannot: string[];
  approveWarning?: string;
};

/** Build "can / cannot" capability sentences from a policy's allowlist + caps. */
export function buildCapabilitySummary(input: {
  targets: string[];
  selectors: string[];
  maxNativeValue: string; // human MNT string
  maxSlippageBps: number;
}): CapabilitySummary {
  const can: string[] = [];
  const cannot: string[] = [];

  const labels = input.selectors.filter(Boolean).map(selectorLabel);
  if (labels.length > 0) {
    can.push(`call: ${labels.join(", ")}`);
  }
  if (input.targets.filter(Boolean).length > 0) {
    can.push(`only on ${input.targets.filter(Boolean).length} approved target(s)`);
  }
  if (input.maxNativeValue && input.maxNativeValue !== "0") {
    can.push(`spend up to ${input.maxNativeValue} MNT per action`);
  }
  if (input.maxSlippageBps > 0) {
    can.push(`accept up to ${(input.maxSlippageBps / 100).toFixed(2)}% slippage`);
  }

  cannot.push("call any target not on the allowlist (TARGET_NOT_ALLOWED)");
  cannot.push("use any selector not on the allowlist (UNKNOWN_SELECTOR)");
  if (input.maxNativeValue === "0") {
    cannot.push("move native value (cap is 0)");
  } else {
    cannot.push(`spend more than ${input.maxNativeValue} MNT per action`);
  }
  cannot.push(`exceed ${(input.maxSlippageBps / 100).toFixed(2)}% slippage`);

  const hasApprove = input.selectors.some((s) => s.toLowerCase() === APPROVE_SELECTOR);
  const approveWarning = hasApprove
    ? "This policy allows approve(). Review the spender and prefer exact-amount approvals — never grant unlimited allowance."
    : undefined;

  return { can, cannot, approveWarning };
}
