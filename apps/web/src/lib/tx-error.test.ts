import { describe, expect, it } from "vitest";
import { BaseError, encodeErrorResult } from "viem";
import { policyGuardedExecutorAbi } from "@interlock/shared";
import { actionableTxError, extractTxError } from "./tx-error";

describe("extractTxError", () => {
  it("returns a plain string error as-is", () => {
    expect(extractTxError("boom")).toBe("boom");
  });

  it("takes only the first line of a noisy multi-line Error", () => {
    const err = new Error("Insufficient funds for gas\n\nRequest Arguments:\n  from: 0x...\n  to: 0x...");
    expect(extractTxError(err)).toBe("Insufficient funds for gas");
  });

  it("maps an EIP-1193 user rejection (code 4001) to a friendly line", () => {
    expect(extractTxError({ code: 4001, message: "User denied" })).toBe("Transaction rejected in wallet.");
  });

  it("maps ethers-style ACTION_REJECTED to the same friendly line", () => {
    expect(extractTxError({ code: "ACTION_REJECTED" })).toBe("Transaction rejected in wallet.");
  });

  it("prefers viem shortMessage over the full message for a BaseError", () => {
    const err = new BaseError("Execution reverted: value exceeds policy limit");
    expect(extractTxError(err)).toBe("Execution reverted: value exceeds policy limit");
  });

  it("decodes an Interlock custom-error from raw revert data carried on error.data", () => {
    const data = encodeErrorResult({ abi: policyGuardedExecutorAbi, errorName: "TargetNotAllowed" });
    const err = Object.assign(new Error("execution reverted"), { data });
    expect(extractTxError(err)).toBe("Reverted: TargetNotAllowed");
  });

  it("decodes a custom-error from a revert-data hex embedded in the error message", () => {
    const data = encodeErrorResult({ abi: policyGuardedExecutorAbi, errorName: "ValueLimitExceeded" });
    const err = new Error(`execution reverted, data: ${data}`);
    expect(extractTxError(err)).toBe("Reverted: ValueLimitExceeded");
  });

  it("walks a viem cause chain to find revert data", () => {
    const data = encodeErrorResult({ abi: policyGuardedExecutorAbi, errorName: "InactivePolicy" });
    const err = new BaseError("Execution reverted", { cause: Object.assign(new Error("revert"), { data }) });
    expect(extractTxError(err)).toBe("Reverted: InactivePolicy");
  });
});

describe("actionableTxError classification", () => {
  it("classifies a decoded custom revert as contract-revert with the decoded reason", () => {
    const data = encodeErrorResult({ abi: policyGuardedExecutorAbi, errorName: "SelectorNotAllowed" });
    const actionable = actionableTxError(Object.assign(new Error("execution reverted"), { data }), "Enforced execution");
    expect(actionable.kind).toBe("contract-revert");
    expect(actionable.message).toBe("Reverted: SelectorNotAllowed");
    expect(actionable.toastVariant).toBe("error");
  });

  it("classifies a user rejection as wallet-rejected (warning, no silent fail)", () => {
    const actionable = actionableTxError({ code: 4001, message: "User denied" }, "Record");
    expect(actionable.kind).toBe("wallet-rejected");
    expect(actionable.toastVariant).toBe("warning");
  });

  it("classifies an RPC fetch failure as rpc-unavailable", () => {
    const actionable = actionableTxError(new Error("fetch failed"), "Dashboard refresh");
    expect(actionable.kind).toBe("rpc-unavailable");
  });
});
