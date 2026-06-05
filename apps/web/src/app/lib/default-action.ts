import { isAddress, type Address, type Hex } from "viem";
import { suggestedCalldataForPolicyAction } from "@interlock/firewall-sdk";
import { webContracts } from "../../lib/contracts";

export function buildCalldata(target: Address, selector: Hex, agentIdValue: string) {
  return suggestedCalldataForPolicyAction({
    target,
    selector,
    agentId: parsePositiveId(agentIdValue),
    agentRegistry: webContracts.agentRegistry,
  });
}

export function normalizeDefaultAddress(value: string | undefined): Address | undefined {
  return value && isAddress(value) ? value : undefined;
}

export function normalizeDefaultSelector(value: string | undefined): Hex | undefined {
  return value && /^0x[0-9a-fA-F]{8}$/.test(value) ? (value as Hex) : undefined;
}

export function parsePositiveId(value: string): bigint | undefined {
  if (!value.match(/^[1-9]\d*$/)) return undefined;
  return BigInt(value);
}
