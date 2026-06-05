import { describe, expect, it } from "vitest";
import {
  agentRegistryGetAgentCalldata,
  agentRegistryGetAgentSelector,
  suggestedCalldataForPolicyAction,
  testStrategyRouterRouteNativeDepositCalldata,
  testStrategyRouterRouteNativeDepositSelector,
  testStrategyVaultDepositForCalldata,
  testStrategyVaultDepositForSelector,
} from "./calldata.js";

const agentRegistry = "0xe4dfef03e107225f2239cfff955a378a9a8158be";
const otherTarget = "0xec7608730978b68a8d8c36b5d1f131634621116d";
const testStrategyVault = "0x1111111111111111111111111111111111111111";
const testStrategyRouter = "0x2222222222222222222222222222222222222222";
const receiver = "0x3333333333333333333333333333333333333333";

describe("calldata helpers", () => {
  it("builds full AgentRegistry getAgent calldata", () => {
    expect(agentRegistryGetAgentCalldata(8n)).toBe(
      "0x2de5aaf70000000000000000000000000000000000000000000000000000000000000008",
    );
  });

  it("suggests full calldata for known AgentRegistry reads", () => {
    expect(
      suggestedCalldataForPolicyAction({
        target: agentRegistry,
        selector: agentRegistryGetAgentSelector,
        agentId: 8n,
        agentRegistry,
      }),
    ).toBe("0x2de5aaf70000000000000000000000000000000000000000000000000000000000000008");
  });

  it("returns selector-only calldata for unknown targets", () => {
    expect(
      suggestedCalldataForPolicyAction({
        target: otherTarget,
        selector: "0x12345678",
        agentId: 8n,
        agentRegistry,
      }),
    ).toBe("0x12345678");
  });

  it("builds full TestStrategyVault depositFor calldata", () => {
    expect(testStrategyVaultDepositForCalldata(receiver)).toBe(
      "0xaa67c9190000000000000000000000003333333333333333333333333333333333333333",
    );
  });

  it("builds full TestStrategyRouter routeNativeDeposit calldata", () => {
    expect(
      testStrategyRouterRouteNativeDepositCalldata({
        vault: testStrategyVault,
        receiver,
        maxSlippageBps: 100,
      }),
    ).toBe(
      "0x1c83fb35000000000000000000000000111111111111111111111111111111111111111100000000000000000000000033333333333333333333333333333333333333330000000000000000000000000000000000000000000000000000000000000064",
    );
  });

  it("suggests full calldata for known TestStrategy actions", () => {
    expect(
      suggestedCalldataForPolicyAction({
        target: testStrategyVault,
        selector: testStrategyVaultDepositForSelector,
        agentId: 8n,
        agentRegistry,
        testStrategyVault,
        receiver,
      }),
    ).toBe("0xaa67c9190000000000000000000000003333333333333333333333333333333333333333");

    expect(
      suggestedCalldataForPolicyAction({
        target: testStrategyRouter,
        selector: testStrategyRouterRouteNativeDepositSelector,
        agentId: 8n,
        agentRegistry,
        testStrategyVault,
        testStrategyRouter,
        receiver,
        maxSlippageBps: 100,
      }),
    ).toBe(
      "0x1c83fb35000000000000000000000000111111111111111111111111111111111111111100000000000000000000000033333333333333333333333333333333333333330000000000000000000000000000000000000000000000000000000000000064",
    );
  });
});
