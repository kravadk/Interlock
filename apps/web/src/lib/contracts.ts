import { zeroAddress, type Address, type Hex } from "viem";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";

export type WebContracts = {
  agentRegistry: Address;
  policyRegistry: Address;
  actionAttestation: Address;
  policyGuardedExecutor: Address;
  disputeEscrow: Address;
  reputationOracle: Address;
};

export const webContracts: WebContracts = {
  agentRegistry: envAddress("NEXT_PUBLIC_AGENT_REGISTRY", deployedAddresses.mantleSepolia.agentRegistry),
  policyRegistry: envAddress("NEXT_PUBLIC_POLICY_REGISTRY", deployedAddresses.mantleSepolia.policyRegistry),
  actionAttestation: envAddress("NEXT_PUBLIC_ACTION_ATTESTATION", deployedAddresses.mantleSepolia.actionAttestation),
  policyGuardedExecutor: envAddress(
    "NEXT_PUBLIC_POLICY_GUARDED_EXECUTOR",
    deployedAddresses.mantleSepolia.policyGuardedExecutor ?? zeroAddress,
  ),
  disputeEscrow: envAddress(
    "NEXT_PUBLIC_DISPUTE_ESCROW",
    deployedAddresses.mantleSepolia.disputeEscrow ?? zeroAddress,
  ),
  reputationOracle: envAddress(
    "NEXT_PUBLIC_REPUTATION_ORACLE",
    deployedAddresses.mantleSepolia.reputationOracle ?? zeroAddress,
  ),
};

export function hasGuardConfigured() {
  return webContracts.policyGuardedExecutor !== zeroAddress;
}

export function hasDisputeEscrowConfigured() {
  return webContracts.disputeEscrow !== zeroAddress;
}

export function hasReputationOracleConfigured() {
  return webContracts.reputationOracle !== zeroAddress;
}

export function hasWriteContractsConfigured() {
  return webContracts.actionAttestation !== zeroAddress;
}

export function hasSetupContractsConfigured() {
  return webContracts.agentRegistry !== zeroAddress && webContracts.policyRegistry !== zeroAddress;
}

export function hasPolicyContractConfigured() {
  return webContracts.policyRegistry !== zeroAddress;
}

export function mantleRpcUrl() {
  return process.env.NEXT_PUBLIC_MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
}

export function actionAttestationFromBlock() {
  const configured = process.env.NEXT_PUBLIC_ACTION_ATTESTATION_FROM_BLOCK?.trim();
  if (configured && /^\d+$/.test(configured)) {
    return BigInt(configured);
  }
  return 39344216n;
}

export function explorerTxUrl(hash: Hex) {
  return `https://sepolia.mantlescan.xyz/tx/${hash}`;
}

export function explorerAddressUrl(address: Address) {
  return `https://sepolia.mantlescan.xyz/address/${address}`;
}

function envAddress(key: string, defaultAddress: Address): Address {
  const value = process.env[key];
  if (value?.startsWith("0x") && value.length === 42) {
    return value as Address;
  }
  return defaultAddress;
}
