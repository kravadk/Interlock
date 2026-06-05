import { decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, maxUint256, type Address, type Hex } from "viem";
import { assertValidAddress } from "./validation.js";

export type Erc20ActionKind = "transfer" | "transferFrom" | "approve" | "unknown";

export type DecodedErc20Action =
  | {
      kind: "transfer";
      recipient: Address;
      amount: bigint;
    }
  | {
      kind: "transferFrom";
      owner: Address;
      recipient: Address;
      amount: bigint;
    }
  | {
      kind: "approve";
      spender: Address;
      amount: bigint;
      unlimited: boolean;
    }
  | {
      kind: "unknown";
      selector: Hex;
    };

export type TokenRule = {
  token: Address;
  allowedRecipients?: Address[];
  allowedSpenders?: Address[];
  maxAmount?: string;
  allowUnlimitedApprove?: boolean;
};

export type TokenGuardReasonCode =
  | "TOKEN_RULE_PASSED"
  | "TOKEN_RULE_NOT_FOUND"
  | "TOKEN_RECIPIENT_NOT_ALLOWED"
  | "TOKEN_SPENDER_NOT_ALLOWED"
  | "TOKEN_AMOUNT_EXCEEDED"
  | "UNLIMITED_APPROVE_BLOCKED"
  | "TOKEN_CALL_NOT_RECOGNIZED";

export type TokenGuardResult = {
  ok: boolean;
  reasonCode: TokenGuardReasonCode;
  action: DecodedErc20Action;
  token: Address;
  explanation: string;
  suggestedFix: string;
};

export function decodeErc20Action(data: Hex): DecodedErc20Action {
  const selector = data.length >= 10 ? (data.slice(0, 10) as Hex) : "0x00000000";
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data });
    if (decoded.functionName === "transfer") {
      const [recipient, amount] = decoded.args;
      return { kind: "transfer", recipient: getAddress(recipient), amount };
    }
    if (decoded.functionName === "transferFrom") {
      const [owner, recipient, amount] = decoded.args;
      return { kind: "transferFrom", owner: getAddress(owner), recipient: getAddress(recipient), amount };
    }
    if (decoded.functionName === "approve") {
      const [spender, amount] = decoded.args;
      return { kind: "approve", spender: getAddress(spender), amount, unlimited: amount === maxUint256 };
    }
  } catch {
    return { kind: "unknown", selector };
  }
  return { kind: "unknown", selector };
}

export function evaluateTokenRules(input: {
  token: Address;
  calldata: Hex;
  rules: TokenRule[];
}): TokenGuardResult {
  assertValidAddress(input.token, "token");
  const token = getAddress(input.token);
  const rule = input.rules.find((item) => item.token.toLowerCase() === token.toLowerCase());
  const action = decodeErc20Action(input.calldata);

  if (!rule) {
    return {
      ok: false,
      reasonCode: "TOKEN_RULE_NOT_FOUND",
      action,
      token,
      explanation: "No token rule exists for this ERC-20 target.",
      suggestedFix: "Add a token rule for this exact token address before allowing ERC-20 transfers or approvals.",
    };
  }

  if (action.kind === "unknown") {
    return {
      ok: false,
      reasonCode: "TOKEN_CALL_NOT_RECOGNIZED",
      action,
      token,
      explanation: "The calldata is not a supported ERC-20 transfer, transferFrom, or approve call.",
      suggestedFix: "Use full ABI-encoded ERC-20 calldata or keep this selector blocked.",
    };
  }

  if (action.kind === "approve") {
    if (action.unlimited && rule.allowUnlimitedApprove !== true) {
      return fail("UNLIMITED_APPROVE_BLOCKED", action, token, "Unlimited approve is blocked by default.", "Use an exact approval amount or explicitly enable unlimited approvals for this token rule.");
    }
    if (rule.allowedSpenders?.length && !hasAddress(rule.allowedSpenders, action.spender)) {
      return fail("TOKEN_SPENDER_NOT_ALLOWED", action, token, "The approve spender is not in the allowedSpenders list.", "Add the verified spender address to the rule or keep this approval blocked.");
    }
    if (rule.maxAmount !== undefined && action.amount > BigInt(rule.maxAmount)) {
      return fail("TOKEN_AMOUNT_EXCEEDED", action, token, "The approval amount exceeds the token rule maxAmount.", "Lower the approval amount or raise maxAmount after review.");
    }
  }

  if (action.kind === "transfer" || action.kind === "transferFrom") {
    if (rule.allowedRecipients?.length && !hasAddress(rule.allowedRecipients, action.recipient)) {
      return fail("TOKEN_RECIPIENT_NOT_ALLOWED", action, token, "The transfer recipient is not in the allowedRecipients list.", "Add the verified recipient address to the rule or keep this transfer blocked.");
    }
    if (rule.maxAmount !== undefined && action.amount > BigInt(rule.maxAmount)) {
      return fail("TOKEN_AMOUNT_EXCEEDED", action, token, "The transfer amount exceeds the token rule maxAmount.", "Lower the transfer amount or raise maxAmount after review.");
    }
  }

  return {
    ok: true,
    reasonCode: "TOKEN_RULE_PASSED",
    action,
    token,
    explanation: "ERC-20 calldata passed the configured token rule.",
    suggestedFix: "No action needed.",
  };
}

export function erc20TransferCalldata(input: { to: Address; amount: bigint }): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [input.to, input.amount] });
}

export function erc20ApproveCalldata(input: { spender: Address; amount: bigint }): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [input.spender, input.amount] });
}

function fail(reasonCode: Exclude<TokenGuardReasonCode, "TOKEN_RULE_PASSED">, action: DecodedErc20Action, token: Address, explanation: string, suggestedFix: string): TokenGuardResult {
  return { ok: false, reasonCode, action, token, explanation, suggestedFix };
}

function hasAddress(addresses: Address[], address: Address): boolean {
  return addresses.some((item) => item.toLowerCase() === address.toLowerCase());
}
