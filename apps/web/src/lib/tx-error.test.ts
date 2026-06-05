import { describe, expect, it } from "vitest";
import { BaseError } from "viem";
import { extractTxError } from "./tx-error";

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
});
