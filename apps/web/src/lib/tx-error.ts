import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, decodeErrorResult, type Hex } from "viem";
import {
  actionAttestationAbi,
  agentRegistryAbi,
  attestorCommitteeAbi,
  disputeEscrowAbi,
  policyGuardedExecutorAbi,
  policyRegistryAbi,
  reputationOracleAbi,
} from "@interlock/shared";

// Combined error fragments from every Interlock contract, so a raw custom-error revert
// (e.g. TargetNotAllowed, ValueLimitExceeded) can be decoded to its name even when viem did not
// have the ABI at the call site (e.g. a re-simulated reverted receipt).
const INTERLOCK_ERROR_ABI = [
  ...agentRegistryAbi,
  ...policyRegistryAbi,
  ...actionAttestationAbi,
  ...policyGuardedExecutorAbi,
  ...disputeEscrowAbi,
  ...attestorCommitteeAbi,
  ...reputationOracleAbi,
].filter((item) => (item as { type?: string }).type === "error");

export type ActionableErrorKind =
  | "wallet-rejected"
  | "wallet-missing"
  | "wrong-chain"
  | "rpc-unavailable"
  | "rpc-timeout"
  | "insufficient-funds"
  | "contract-revert"
  | "pending-transaction"
  | "indexer-unavailable"
  | "validation"
  | "unknown";

export type ActionableError = {
  kind: ActionableErrorKind;
  title: string;
  message: string;
  suggestedFix: string;
  raw: string;
  txHash?: Hex;
  toastVariant: "error" | "warning" | "info";
};

export class PendingTransactionError extends Error {
  txHash: Hex;

  constructor(txHash: Hex, message = "Transaction was submitted, but confirmation timed out.") {
    super(message);
    this.name = "PendingTransactionError";
    this.txHash = txHash;
  }
}

/**
 * Turn an on-chain write failure into a single human-readable line.
 *
 * Prefers viem's structured error info over the raw multi-line message:
 *  - EIP-1193 user rejection (code 4001 / UserRejectedRequestError) → friendly text;
 *  - ContractFunctionRevertedError → the decoded revert reason or custom-error name;
 *  - otherwise the viem `shortMessage`, falling back to the first line of `message`.
 */
export function extractTxError(error: unknown): string {
  // Injected-wallet rejections often arrive as a plain object with an EIP-1193 code.
  if (isRejectionCode(error)) return "Transaction rejected in wallet.";

  if (error instanceof BaseError) {
    const rejected = error.walk((e) => e instanceof UserRejectedRequestError);
    if (rejected) return "Transaction rejected in wallet.";

    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      if (reverted.reason) return reverted.reason;
      const name = reverted.data?.errorName;
      if (name) return `Reverted: ${name}`;
      if (reverted.shortMessage) return firstLine(reverted.shortMessage);
    }

    // Custom error with raw revert data viem could not decode at the call site — decode it against
    // the combined Interlock contract error ABI to recover the error name (e.g. TargetNotAllowed).
    const decoded = decodeKnownRevert(revertData(error));
    if (decoded) return `Reverted: ${decoded}`;

    if (error.shortMessage) return firstLine(error.shortMessage);
    return firstLine(error.message);
  }

  if (error instanceof Error) {
    const decoded = decodeKnownRevert(revertData(error));
    if (decoded) return `Reverted: ${decoded}`;
    return firstLine(error.message);
  }
  return String(error);
}

/** Pull 0x-prefixed revert data out of a viem error chain (RawContractError / cause.data / hex in message). */
function revertData(error: unknown): Hex | undefined {
  let cursor: unknown = error;
  for (let depth = 0; depth < 8 && cursor; depth += 1) {
    const data = (cursor as { data?: unknown }).data;
    if (typeof data === "string" && /^0x[0-9a-fA-F]{8,}$/.test(data)) return data as Hex;
    cursor = (cursor as { cause?: unknown }).cause;
  }
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = raw.match(/0x[0-9a-fA-F]{8,}/);
  return match ? (match[0] as Hex) : undefined;
}

function decodeKnownRevert(data: Hex | undefined): string | undefined {
  if (!data || data === "0x") return undefined;
  try {
    const decoded = decodeErrorResult({ abi: INTERLOCK_ERROR_ABI, data });
    return decoded.errorName;
  } catch {
    return undefined;
  }
}

export function actionableTxError(error: unknown, context = "Transaction"): ActionableError {
  const raw = rawError(error);
  const message = extractTxError(error);
  // Classify on the human message text, NOT the full stack: stack frame paths can contain
  // substrings like "timeout"/"rpc"/"fetch" that would misclassify the error. `raw` (the stack)
  // is kept only for the copy-details field.
  const lower = `${message} ${errorMessageText(error)}`.toLowerCase();

  if (error instanceof PendingTransactionError) {
    return {
      kind: "pending-transaction",
      title: `${context} still pending`,
      message,
      suggestedFix: "Open the transaction on Mantlescan or retry status after a short delay. Do not submit the same action twice unless you have checked the pending transaction.",
      raw,
      txHash: error.txHash,
      toastVariant: "warning",
    };
  }

  if (isRejectionCode(error) || lower.includes("user rejected") || lower.includes("user denied")) {
    return {
      kind: "wallet-rejected",
      title: `${context} rejected`,
      message: "Transaction rejected in wallet. No on-chain changes were made.",
      suggestedFix: "Review the wallet prompt and submit again only if the action is expected.",
      raw,
      toastVariant: "warning",
    };
  }

  if (lower.includes("injected wallet not found") || lower.includes("window.ethereum") || lower.includes("no wallet")) {
    return {
      kind: "wallet-missing",
      title: "Wallet unavailable",
      message,
      suggestedFix: "Open the dashboard in a browser profile with MetaMask, Rabby, Coinbase Wallet, or another injected wallet enabled.",
      raw,
      toastVariant: "warning",
    };
  }

  if (lower.includes("wrong chain") || lower.includes("unsupported chain") || lower.includes("chain mismatch")) {
    return {
      kind: "wrong-chain",
      title: "Wrong network",
      message: "Switch to Mantle Sepolia before writing transactions.",
      suggestedFix: "Use the Switch Mantle button, then retry the action.",
      raw,
      toastVariant: "warning",
    };
  }

  if (lower.includes("insufficient funds") || lower.includes("exceeds the balance")) {
    return {
      kind: "insufficient-funds",
      title: "Insufficient funds",
      message: "The connected wallet does not have enough MNT to submit this transaction.",
      suggestedFix: "Fund the wallet on Mantle Sepolia, then retry.",
      raw,
      toastVariant: "warning",
    };
  }

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return {
      kind: "rpc-timeout",
      title: `${context} timed out`,
      message,
      suggestedFix: "Retry status or switch to a more reliable Mantle RPC endpoint.",
      raw,
      toastVariant: "warning",
    };
  }

  if (lower.includes("fetch failed") || lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("http 429") || lower.includes("rate limit") || lower.includes("rpc")) {
    return {
      kind: "rpc-unavailable",
      title: "Mantle RPC unavailable",
      message,
      suggestedFix: "Retry the request. If it repeats, configure NEXT_PUBLIC_MANTLE_RPC_URL or use a hosted Recorder API.",
      raw,
      toastVariant: "error",
    };
  }

  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted) {
      return {
        kind: "contract-revert",
        title: `${context} reverted`,
        message,
        suggestedFix: "Inspect the decoded reason, fix the policy/action input, then run preflight again before writing.",
        raw,
        toastVariant: "error",
      };
    }
  }

  if (lower.includes("reverted") || lower.includes("execution reverted")) {
    return {
      kind: "contract-revert",
      title: `${context} reverted`,
      message,
      suggestedFix: "Inspect the decoded reason, fix the policy/action input, then run preflight again before writing.",
      raw,
      toastVariant: "error",
    };
  }

  return {
    kind: "unknown",
    title: `${context} failed`,
    message,
    suggestedFix: "Retry once. If it repeats, copy the raw error from details and check RPC, wallet, and contract configuration.",
    raw,
    toastVariant: "error",
  };
}

function isRejectionCode(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 4001 || code === "ACTION_REJECTED";
}

function firstLine(message: string): string {
  const line = message.split("\n")[0]?.trim();
  return line || message;
}

function rawError(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Error message text (walking the cause chain) WITHOUT the stack — safe for substring classification. */
function errorMessageText(error: unknown): string {
  const parts: string[] = [];
  let cursor: unknown = error;
  for (let depth = 0; depth < 8 && cursor; depth += 1) {
    if (cursor instanceof Error) parts.push(cursor.message);
    else if (typeof cursor === "string") parts.push(cursor);
    else if (typeof cursor === "object") {
      const msg = (cursor as { message?: unknown }).message;
      if (typeof msg === "string") parts.push(msg);
    }
    cursor = (cursor as { cause?: unknown })?.cause;
  }
  return parts.join(" ");
}
