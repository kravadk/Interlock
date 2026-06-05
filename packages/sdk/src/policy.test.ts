import { describe, expect, it } from "vitest";
import { encodeFunctionData, keccak256, parseEther } from "viem";
import { calldataHash, evaluatePolicy, getSelector } from "./policy.js";

const tx = {
  to: "0xe4dfef03e107225f2239cfff955a378a9a8158be" as const,
  value: parseEther("0.01"),
  data: encodeFunctionData({ abi: [{ type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] }], functionName: "deposit" }),
};

const policy = {
  owner: "0xec7608730978b68a8d8c36b5d1f131634621116d" as const,
  agentId: 1n,
  maxNativeValue: parseEther("0.02"),
  maxSlippageBps: 100,
  active: true,
};

describe("policy evaluation", () => {
  it("allows a simulated action that passes policy checks", () => {
    const result = evaluatePolicy({ targetAllowed: true, selectorAllowed: true, simulationSuccess: true, expectedSlippageBps: 50, tx, policy });
    expect(result.allowed).toBe(true);
    expect(result.reasonCode).toBe("POLICY_PASSED");
  });

  it("blocks unknown targets", () => {
    const result = evaluatePolicy({ targetAllowed: false, selectorAllowed: true, simulationSuccess: true, tx, policy });
    expect(result.reasonCode).toBe("TARGET_NOT_ALLOWED");
  });

  it("blocks overspending", () => {
    const result = evaluatePolicy({ targetAllowed: true, selectorAllowed: true, simulationSuccess: true, tx: { ...tx, value: parseEther("1") }, policy });
    expect(result.reasonCode).toBe("VALUE_LIMIT_EXCEEDED");
  });

  it("extracts a function selector", () => {
    expect(getSelector(tx.data)).toHaveLength(10);
  });

  it("rejects negative slippage before policy evaluation can pass", () => {
    expect(() =>
      evaluatePolicy({
        targetAllowed: true,
        selectorAllowed: true,
        simulationSuccess: true,
        expectedSlippageBps: -50,
        tx,
        policy,
      }),
    ).toThrow("expectedSlippageBps");
  });

  it("hashes empty calldata as empty bytes, not a zero byte", () => {
    expect(calldataHash("0x")).toBe(keccak256("0x"));
    expect(calldataHash("0x")).not.toBe(calldataHash("0x00"));
  });

  it("rejects odd-length calldata", () => {
    expect(() => calldataHash("0x0")).toThrow("calldata");
  });
});
