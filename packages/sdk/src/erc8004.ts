import { getAddress, type Address, type Hex, type PublicClient } from "viem";

export const erc8004IdentityRegistryAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "getAgentWallet",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const erc8004ReputationRegistryAbi = [
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "bytes32" },
      { name: "tag2", type: "bytes32" },
    ],
    outputs: [
      { name: "count", type: "uint256" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
] as const;

export type Erc8004Agent = {
  registry: Address;
  agentId: string;
  owner: Address;
  tokenURI: string;
  agentWallet?: Address;
};

export type Erc8004ManifestService = {
  type: "mcp" | "a2a" | "oasf" | "api" | "dashboard" | "email";
  url: string;
  description?: string;
};

export type Erc8004AgentManifest = {
  type: "erc8004.agent.registration.v1";
  name: string;
  description: string;
  image?: string;
  interlockAgentId: string;
  services: Erc8004ManifestService[];
  registrations: Array<{ agentRegistry: string; agentId: string }>;
  supportedTrust: Array<"reputation" | "validation" | "crypto-economic" | "interlock-evidence">;
};

export async function getErc8004Agent(input: {
  publicClient: PublicClient;
  identityRegistry: Address;
  agentId: bigint;
}): Promise<Erc8004Agent> {
  const [owner, tokenURI, agentWallet] = await Promise.all([
    input.publicClient.readContract({
      address: input.identityRegistry,
      abi: erc8004IdentityRegistryAbi,
      functionName: "ownerOf",
      args: [input.agentId],
    }) as Promise<Address>,
    input.publicClient.readContract({
      address: input.identityRegistry,
      abi: erc8004IdentityRegistryAbi,
      functionName: "tokenURI",
      args: [input.agentId],
    }) as Promise<string>,
    input.publicClient.readContract({
      address: input.identityRegistry,
      abi: erc8004IdentityRegistryAbi,
      functionName: "getAgentWallet",
      args: [input.agentId],
    }).catch(() => undefined) as Promise<Address | undefined>,
  ]);
  return {
    registry: getAddress(input.identityRegistry),
    agentId: input.agentId.toString(),
    owner: getAddress(owner),
    tokenURI,
    agentWallet: agentWallet ? getAddress(agentWallet) : undefined,
  };
}

export async function getErc8004ReputationSummary(input: {
  publicClient: PublicClient;
  reputationRegistry: Address;
  agentId: bigint;
  clientAddresses: Address[];
  tag1?: Hex;
  tag2?: Hex;
}): Promise<{ count: string; summaryValue: string; summaryValueDecimals: number }> {
  const [count, summaryValue, summaryValueDecimals] = (await input.publicClient.readContract({
    address: input.reputationRegistry,
    abi: erc8004ReputationRegistryAbi,
    functionName: "getSummary",
    args: [input.agentId, input.clientAddresses, input.tag1 ?? zeroBytes32(), input.tag2 ?? zeroBytes32()],
  })) as [bigint, bigint, number];
  return {
    count: count.toString(),
    summaryValue: summaryValue.toString(),
    summaryValueDecimals: Number(summaryValueDecimals),
  };
}

export function buildErc8004AgentManifest(input: {
  interlockAgentId: bigint | string;
  name: string;
  description: string;
  image?: string;
  services: Erc8004ManifestService[];
  registrations?: Array<{ agentRegistry: string; agentId: string }>;
}): Erc8004AgentManifest {
  return {
    type: "erc8004.agent.registration.v1",
    name: input.name,
    description: input.description,
    image: input.image,
    interlockAgentId: input.interlockAgentId.toString(),
    services: input.services,
    registrations: input.registrations ?? [],
    supportedTrust: ["reputation", "validation", "interlock-evidence"],
  };
}

export function linkInterlockAgentToErc8004(input: {
  interlockAgentId: bigint | string;
  erc8004Registry: Address;
  erc8004AgentId: bigint | string;
}) {
  return {
    type: "interlock.erc8004.link.v1",
    interlockAgentId: input.interlockAgentId.toString(),
    erc8004: {
      registry: getAddress(input.erc8004Registry),
      agentId: input.erc8004AgentId.toString(),
      namespace: `eip155:5003:${getAddress(input.erc8004Registry)}`,
    },
  };
}

function zeroBytes32(): Hex {
  return "0x0000000000000000000000000000000000000000000000000000000000000000";
}
