import { encodeFunctionData, toFunctionSelector, type Address, type Hex } from "viem";
import { agentRegistryAbi, testStrategyRouterAbi, testStrategyVaultAbi } from "@interlock/shared";
import { assertValidSlippageBps } from "./validation.js";

export const agentRegistryGetAgentSelector = toFunctionSelector("getAgent(uint256)") as Hex;
export const testStrategyVaultDepositForSelector = toFunctionSelector("depositFor(address)") as Hex;
export const testStrategyRouterRouteNativeDepositSelector = toFunctionSelector("routeNativeDeposit(address,address,uint16)") as Hex;
export const testStrategyRouterQuoteNativeDepositSelector = toFunctionSelector("quoteNativeDeposit(address,uint256)") as Hex;

export function agentRegistryGetAgentCalldata(agentId: bigint): Hex {
  return encodeFunctionData({ abi: agentRegistryAbi, functionName: "getAgent", args: [agentId] });
}

export function testStrategyVaultDepositForCalldata(receiver: Address): Hex {
  return encodeFunctionData({ abi: testStrategyVaultAbi, functionName: "depositFor", args: [receiver] });
}

export function testStrategyRouterRouteNativeDepositCalldata(input: {
  vault: Address;
  receiver: Address;
  maxSlippageBps: number;
}): Hex {
  assertValidSlippageBps(input.maxSlippageBps, "maxSlippageBps");
  return encodeFunctionData({
    abi: testStrategyRouterAbi,
    functionName: "routeNativeDeposit",
    args: [input.vault, input.receiver, input.maxSlippageBps],
  });
}

export function testStrategyRouterQuoteNativeDepositCalldata(input: { vault: Address; value: bigint }): Hex {
  return encodeFunctionData({
    abi: testStrategyRouterAbi,
    functionName: "quoteNativeDeposit",
    args: [input.vault, input.value],
  });
}

export function suggestedCalldataForPolicyAction(input: {
  target: Address | undefined;
  selector: Hex;
  agentId: bigint | undefined;
  agentRegistry: Address;
  testStrategyVault?: Address;
  testStrategyRouter?: Address;
  receiver?: Address;
  maxSlippageBps?: number;
}): Hex {
  if (
    input.target?.toLowerCase() === input.agentRegistry.toLowerCase() &&
    input.selector.toLowerCase() === agentRegistryGetAgentSelector.toLowerCase() &&
    input.agentId
  ) {
    return agentRegistryGetAgentCalldata(input.agentId);
  }

  if (
    input.testStrategyVault &&
    input.receiver &&
    input.target?.toLowerCase() === input.testStrategyVault.toLowerCase() &&
    input.selector.toLowerCase() === testStrategyVaultDepositForSelector.toLowerCase()
  ) {
    return testStrategyVaultDepositForCalldata(input.receiver);
  }

  if (
    input.testStrategyRouter &&
    input.testStrategyVault &&
    input.receiver &&
    input.target?.toLowerCase() === input.testStrategyRouter.toLowerCase() &&
    input.selector.toLowerCase() === testStrategyRouterRouteNativeDepositSelector.toLowerCase()
  ) {
    return testStrategyRouterRouteNativeDepositCalldata({
      vault: input.testStrategyVault,
      receiver: input.receiver,
      maxSlippageBps: input.maxSlippageBps ?? 100,
    });
  }

  return input.selector;
}
