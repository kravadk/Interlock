import { zeroAddress, type Address, type Hex } from "viem";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";

export type WebContracts = {
  agentRegistry: Address;
  policyRegistry: Address;
  actionAttestation: Address;
  policyGuardedExecutor: Address;
  disputeEscrow: Address;
  reputationOracle: Address;
  // Official ERC-8004 registries (verified-deployed on Mantle Sepolia; default to the shared address).
  erc8004IdentityRegistry: Address;
  erc8004ReputationRegistry: Address;
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
  erc8004IdentityRegistry: envAddress(
    "NEXT_PUBLIC_ERC8004_IDENTITY_REGISTRY",
    deployedAddresses.mantleSepolia.erc8004IdentityRegistry ?? zeroAddress,
  ),
  erc8004ReputationRegistry: envAddress(
    "NEXT_PUBLIC_ERC8004_REPUTATION_REGISTRY",
    deployedAddresses.mantleSepolia.erc8004ReputationRegistry ?? zeroAddress,
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

export function hasErc8004Configured() {
  return webContracts.erc8004IdentityRegistry !== zeroAddress;
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
  return 39644615n; // ActionAttestationV4 deploy block (committee recording). V3 was 39344216.
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
