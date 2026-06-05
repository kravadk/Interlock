import { createPublicClient, http, zeroAddress, type Address, type Hex } from "viem";
import { mantleSepolia, policyRegistryAbi } from "@interlock/shared";
import type { InterlockContracts } from "@interlock/firewall-sdk";

type DoctorPublicClient = {
  getChainId: () => Promise<number>;
  getBlockNumber: () => Promise<bigint>;
  getBytecode: (input: { address: Address }) => Promise<Hex | undefined>;
  readContract?: (input: { address: Address; abi: typeof policyRegistryAbi; functionName: "supportsPolicyEnumeration" | "VERSION" }) => Promise<unknown>;
};

type ContractCheck = {
  address: Address;
  configured: boolean;
  hasCode: boolean;
  bytecodeBytes: number;
  error?: string;
  compatibility?: {
    policyEnumeration?: {
      supported: boolean;
      version?: string;
      error?: string;
    };
  };
};

export type DoctorConfig = {
  rpcUrl: string;
  contracts: InterlockContracts;
  privateKeyConfigured: boolean;
  indexerUrl?: string;
  publicClient?: DoctorPublicClient;
};

export type DoctorReport = {
  ok: boolean;
  rpc: {
    url: string;
    reachable: boolean;
    chainId?: number;
    expectedChainId: number;
    blockNumber?: string;
    error?: string;
  };
  contracts: Record<
    keyof InterlockContracts,
    ContractCheck
  >;
  privateKeyConfigured: boolean;
  indexer?: {
    url: string;
    reachable: boolean;
    status?: number;
    health?: unknown;
    error?: string;
  };
};

export async function buildDoctorReport(config: DoctorConfig): Promise<DoctorReport> {
  const publicClient =
    config.publicClient ??
    createPublicClient({
      chain: mantleSepolia,
      transport: http(config.rpcUrl),
    });

  const rpc = await checkRpc(config.rpcUrl, publicClient);
  const agentRegistry = await checkContract(publicClient, config.contracts.agentRegistry);
  const policyRegistry = await checkContract(publicClient, config.contracts.policyRegistry);
  const actionAttestation = await checkContract(publicClient, config.contracts.actionAttestation);
  if (policyRegistry.configured && policyRegistry.hasCode) {
    policyRegistry.compatibility = {
      policyEnumeration: await checkPolicyEnumeration(publicClient, config.contracts.policyRegistry),
    };
  }
  const contracts = { agentRegistry, policyRegistry, actionAttestation };
  const indexer = config.indexerUrl ? await checkIndexer(config.indexerUrl) : undefined;

  const contractsOk = Object.values(contracts).every((contract) => contract.configured && contract.hasCode);
  const policyCompatibilityOk = policyRegistry.compatibility?.policyEnumeration?.supported ?? !policyRegistry.configured;
  const indexerOk = !indexer || indexer.reachable;

  return {
    ok: rpc.reachable && rpc.chainId === mantleSepolia.id && contractsOk && policyCompatibilityOk && indexerOk,
    rpc,
    contracts,
    privateKeyConfigured: config.privateKeyConfigured,
    indexer,
  };
}

async function checkRpc(rpcUrl: string, publicClient: DoctorPublicClient): Promise<DoctorReport["rpc"]> {
  try {
    const [chainId, blockNumber] = await Promise.all([publicClient.getChainId(), publicClient.getBlockNumber()]);
    return {
      url: rpcUrl,
      reachable: true,
      chainId,
      expectedChainId: mantleSepolia.id,
      blockNumber: blockNumber.toString(),
    };
  } catch (error) {
    return {
      url: rpcUrl,
      reachable: false,
      expectedChainId: mantleSepolia.id,
      error: error instanceof Error ? error.message : "Unknown RPC error",
    };
  }
}

async function checkContract(publicClient: DoctorPublicClient, address: Address): Promise<ContractCheck> {
  try {
    const bytecode = await publicClient.getBytecode({ address });
    return {
      address,
      configured: address !== zeroAddress,
      hasCode: Boolean(bytecode && bytecode !== "0x"),
      bytecodeBytes: bytecode && bytecode !== "0x" ? (bytecode.length - 2) / 2 : 0,
    };
  } catch (error) {
    return {
      address,
      configured: address !== zeroAddress,
      hasCode: false,
      bytecodeBytes: 0,
      error: error instanceof Error ? error.message : "Unknown bytecode error",
    };
  }
}

async function checkPolicyEnumeration(publicClient: DoctorPublicClient, address: Address): Promise<{ supported: boolean; version?: string; error?: string }> {
  if (!publicClient.readContract) {
    return { supported: false, error: "Doctor public client cannot read contract functions." };
  }

  try {
    const [supported, version] = await Promise.all([
      publicClient.readContract({
        address,
        abi: policyRegistryAbi,
        functionName: "supportsPolicyEnumeration",
      }),
      publicClient.readContract({
        address,
        abi: policyRegistryAbi,
        functionName: "VERSION",
      }),
    ]);

    return {
      supported: supported === true,
      version: typeof version === "string" ? version : undefined,
    };
  } catch (error) {
    return {
      supported: false,
      error: error instanceof Error ? error.message : "PolicyRegistry compatibility check failed.",
    };
  }
}

async function checkIndexer(indexerUrl: string): Promise<NonNullable<DoctorReport["indexer"]>> {
  const url = `${indexerUrl.replace(/\/$/, "")}/health`;

  try {
    const response = await fetch(url);
    let health: unknown;
    try {
      health = await response.json();
    } catch {
      health = await response.text();
    }

    return {
      url: indexerUrl,
      reachable: response.ok,
      status: response.status,
      health,
    };
  } catch (error) {
    return {
      url: indexerUrl,
      reachable: false,
      error: error instanceof Error ? error.message : "Unknown indexer error",
    };
  }
}
