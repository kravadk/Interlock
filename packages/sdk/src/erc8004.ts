import { getAddress, type Account, type Address, type Hex, type PublicClient, type WalletClient } from "viem";

// ABIs target the canonical ERC-8004 ("Trustless Agents") interface as defined by EIP-8004
// (https://eips.ethereum.org/EIPS/eip-8004) and deployed by mantlenetworkio on Mantle. Reads
// degrade gracefully (callers catch), and writes are user-owned + approval-gated — confirm the
// live contract ABI on Mantlescan before a production write if the standard has since evolved.
export const erc8004IdentityRegistryAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "setAgentURI",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" },
    ],
    outputs: [],
  },
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
    name: "giveFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint64" },
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
  tag1?: string;
  tag2?: string;
}): Promise<{ count: string; summaryValue: string; summaryValueDecimals: number }> {
  const [count, summaryValue, summaryValueDecimals] = (await input.publicClient.readContract({
    address: input.reputationRegistry,
    abi: erc8004ReputationRegistryAbi,
    functionName: "getSummary",
    args: [input.agentId, input.clientAddresses, input.tag1 ?? "", input.tag2 ?? ""],
  })) as [bigint, bigint, number];
  return {
    count: count.toString(),
    summaryValue: summaryValue.toString(),
    summaryValueDecimals: Number(summaryValueDecimals),
  };
}

/**
 * Register an Interlock-protected agent into the OFFICIAL ERC-8004 IdentityRegistry, minting a
 * standard agent NFT whose `agentURI` points at the agent's registration manifest. On-chain write
 * (gas), user-owned + approval-gated. Returns the tx hash; read the minted agentId from the receipt.
 */
export async function registerErc8004Agent(input: {
  walletClient: WalletClient;
  account: Account | Address;
  identityRegistry: Address;
  agentURI: string;
  chain?: WalletClient["chain"];
}): Promise<Hex> {
  return input.walletClient.writeContract({
    address: input.identityRegistry,
    abi: erc8004IdentityRegistryAbi,
    functionName: "register",
    args: [input.agentURI],
    account: input.account,
    chain: input.chain ?? input.walletClient.chain,
  });
}

/** Update the `agentURI` (registration manifest pointer) of an already-registered ERC-8004 agent. */
export async function setErc8004AgentUri(input: {
  walletClient: WalletClient;
  account: Account | Address;
  identityRegistry: Address;
  agentId: bigint;
  newURI: string;
  chain?: WalletClient["chain"];
}): Promise<Hex> {
  return input.walletClient.writeContract({
    address: input.identityRegistry,
    abi: erc8004IdentityRegistryAbi,
    functionName: "setAgentURI",
    args: [input.agentId, input.newURI],
    account: input.account,
    chain: input.chain ?? input.walletClient.chain,
  });
}

/**
 * Publish an Interlock reputation signal as standard ERC-8004 feedback in the official
 * ReputationRegistry. `value`/`valueDecimals` are fixed-point (e.g. a pass-rate score). Tags let
 * consumers filter (e.g. "interlock", "firewall"). On-chain write, user-owned + approval-gated.
 */
export async function giveErc8004Feedback(input: {
  walletClient: WalletClient;
  account: Account | Address;
  reputationRegistry: Address;
  agentId: bigint;
  value: bigint;
  valueDecimals: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  feedbackURI?: string;
  feedbackHash?: Hex;
  chain?: WalletClient["chain"];
}): Promise<Hex> {
  return input.walletClient.writeContract({
    address: input.reputationRegistry,
    abi: erc8004ReputationRegistryAbi,
    functionName: "giveFeedback",
    args: [
      input.agentId,
      input.value,
      input.valueDecimals,
      input.tag1 ?? "interlock",
      input.tag2 ?? "",
      input.endpoint ?? "",
      input.feedbackURI ?? "",
      input.feedbackHash ?? zeroBytes32(),
    ],
    account: input.account,
    chain: input.chain ?? input.walletClient.chain,
  });
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
