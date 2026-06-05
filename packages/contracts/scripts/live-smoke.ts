import { createPublicClient, createWalletClient, decodeEventLog, encodeFunctionData, http, keccak256, parseEther, toFunctionSelector, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  Decision,
  ReasonCode,
  actionAttestationAbi,
  agentRegistryAbi,
  deployedAddresses,
  mantleSepolia,
  policyRegistryAbi,
} from "@interlock/shared";

const zeroAddress = "0x0000000000000000000000000000000000000000";
const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];

if (!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000") {
  throw new Error("Set PRIVATE_KEY before running live smoke.");
}

const contracts = {
  agentRegistry: envAddress("AGENT_REGISTRY", deployedAddresses.mantleSepolia.agentRegistry),
  policyRegistry: envAddress("POLICY_REGISTRY", deployedAddresses.mantleSepolia.policyRegistry),
  actionAttestation: envAddress("ACTION_ATTESTATION", deployedAddresses.mantleSepolia.actionAttestation),
};

for (const [name, address] of Object.entries(contracts)) {
  if (address === zeroAddress) {
    throw new Error(`Missing ${name} address. Set env var or update packages/shared/src/addresses.ts after deploy.`);
  }
}

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http(rpcUrl) });

const chainId = await publicClient.getChainId();
if (chainId !== mantleSepolia.id) {
  throw new Error(`Wrong chain id ${chainId}. Expected Mantle Sepolia ${mantleSepolia.id}.`);
}

for (const [name, address] of Object.entries(contracts)) {
  const bytecode = await publicClient.getBytecode({ address });
  if (!bytecode || bytecode === "0x") {
    throw new Error(`No contract bytecode at ${name}: ${address}`);
  }
}

const [policyRegistryVersion, supportsPolicyEnumeration] = await Promise.all([
  publicClient.readContract({
    address: contracts.policyRegistry,
    abi: policyRegistryAbi,
    functionName: "VERSION",
  }),
  publicClient.readContract({
    address: contracts.policyRegistry,
    abi: policyRegistryAbi,
    functionName: "supportsPolicyEnumeration",
  }),
]);

if (policyRegistryVersion !== "1.2.0" || supportsPolicyEnumeration !== true) {
  throw new Error(`PolicyRegistry compatibility failed. Expected v1.2.0 enumerable registry, got version=${policyRegistryVersion}, enumeration=${supportsPolicyEnumeration}. Redeploy contracts.`);
}

const registerHash = await walletClient.writeContract({
  account,
  chain: mantleSepolia,
  address: contracts.agentRegistry,
  abi: agentRegistryAbi,
  functionName: "registerAgent",
  args: [`ipfs://interlock-live-smoke-${Date.now()}`],
});
const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });
if (registerReceipt.status !== "success") {
  throw new Error(`Agent registration failed: ${registerHash}`);
}
const agentId = readAgentIdFromReceipt(registerReceipt);

const getAgentSelector = toFunctionSelector("getAgent(uint256)");
const policyHash = await walletClient.writeContract({
  account,
  chain: mantleSepolia,
  address: contracts.policyRegistry,
  abi: policyRegistryAbi,
  functionName: "createPolicy",
  args: [agentId, parseEther("0.02"), 100, [contracts.agentRegistry], [getAgentSelector]],
});
const policyReceipt = await publicClient.waitForTransactionReceipt({ hash: policyHash });
if (policyReceipt.status !== "success") {
  throw new Error(`Policy creation failed: ${policyHash}`);
}
const policyId = readPolicyIdFromReceipt(policyReceipt);

const { allowedTargets, allowedSelectors } = await waitForPolicyAllowlists(policyId);

if (!allowedTargets.some((target) => target.toLowerCase() === contracts.agentRegistry.toLowerCase())) {
  throw new Error("PolicyRegistry getAllowedTargets did not include AgentRegistry.");
}

if (!allowedSelectors.includes(getAgentSelector)) {
  throw new Error("PolicyRegistry getAllowedSelectors did not include getAgent selector.");
}

const getAgentData = encodeFunctionData({ abi: agentRegistryAbi, functionName: "getAgent", args: [agentId] });
const calldataHash = keccak256(getAgentData);

const allowHash = await walletClient.writeContract({
  account,
  chain: mantleSepolia,
  address: contracts.actionAttestation,
  abi: actionAttestationAbi,
  functionName: "recordAction",
  args: await signedRecordArgs({
    agentId,
    policyId,
    target: contracts.agentRegistry,
    value: 0n,
    calldataHash,
    selector: getAgentSelector,
    simulationHash: calldataHash,
    decision: Decision.ALLOW,
    reasonCode: ReasonCode.POLICY_PASSED,
  }),
});
const allowReceipt = await publicClient.waitForTransactionReceipt({ hash: allowHash });
if (allowReceipt.status !== "success") {
  throw new Error(`ALLOW attestation failed: ${allowHash}`);
}

const blockHash = await walletClient.writeContract({
  account,
  chain: mantleSepolia,
  address: contracts.actionAttestation,
  abi: actionAttestationAbi,
  functionName: "recordAction",
  args: await signedRecordArgs({
    agentId,
    policyId,
    target: contracts.agentRegistry,
    value: parseEther("0.25"),
    calldataHash,
    selector: getAgentSelector,
    simulationHash: calldataHash,
    decision: Decision.BLOCK,
    reasonCode: ReasonCode.VALUE_LIMIT_EXCEEDED,
  }),
});
const blockReceipt = await publicClient.waitForTransactionReceipt({ hash: blockHash });
if (blockReceipt.status !== "success") {
  throw new Error(`BLOCK attestation failed: ${blockHash}`);
}

const agent = await waitForAgentStats(agentId);

console.log("Mantle Sepolia live smoke passed");
console.table([
  { key: "agentId", value: agentId.toString() },
  { key: "policyId", value: policyId.toString() },
  { key: "policyRegistryVersion", value: policyRegistryVersion },
  { key: "supportsPolicyEnumeration", value: String(supportsPolicyEnumeration) },
  { key: "allowedTargetCount", value: allowedTargets.length.toString() },
  { key: "allowedSelectorCount", value: allowedSelectors.length.toString() },
  { key: "registerTx", value: registerHash },
  { key: "policyTx", value: policyHash },
  { key: "allowTx", value: allowHash },
  { key: "blockTx", value: blockHash },
  { key: "allowedActions", value: agent.allowedActions.toString() },
  { key: "blockedActions", value: agent.blockedActions.toString() },
]);

function envAddress(name: string, defaultAddress: Address): Address {
  return (process.env[name] as Address | undefined) ?? defaultAddress;
}

async function waitForPolicyAllowlists(policyId: bigint) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const [allowedTargets, allowedSelectors] = await Promise.all([
        publicClient.readContract({
          address: contracts.policyRegistry,
          abi: policyRegistryAbi,
          functionName: "getAllowedTargets",
          args: [policyId],
        }),
        publicClient.readContract({
          address: contracts.policyRegistry,
          abi: policyRegistryAbi,
          functionName: "getAllowedSelectors",
          args: [policyId],
        }),
      ]);

      return { allowedTargets, allowedSelectors };
    } catch (error) {
      lastError = error;
      await sleep(2_000);
    }
  }

  throw new Error(`Policy ${policyId} was not readable after waiting for RPC consistency: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function waitForAgentStats(agentId: bigint) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const agent = await publicClient.readContract({
        address: contracts.agentRegistry,
        abi: agentRegistryAbi,
        functionName: "getAgent",
        args: [agentId],
      });

      if (agent.allowedActions > 0n && agent.blockedActions > 0n) {
        return agent;
      }

      lastError = new Error(`reputation counters not updated yet: allowed=${agent.allowedActions}, blocked=${agent.blockedActions}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(2_000);
  }

  throw new Error(`Agent ${agentId} stats were not readable after waiting for RPC consistency: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function readAgentIdFromReceipt(receipt: { transactionHash: Hex; logs: Array<{ address: Address; data: Hex; topics: readonly Hex[] }> }) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contracts.agentRegistry.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: agentRegistryAbi,
        data: log.data,
        topics: [...log.topics] as [] | [signature: Hex, ...args: Hex[]],
      });
      if (decoded.eventName === "AgentRegistered") {
        return decoded.args.agentId;
      }
    } catch {
      continue;
    }
  }
  throw new Error(`AgentRegistered event not found in ${receipt.transactionHash}`);
}

function readPolicyIdFromReceipt(receipt: { transactionHash: Hex; logs: Array<{ address: Address; data: Hex; topics: readonly Hex[] }> }) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contracts.policyRegistry.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: policyRegistryAbi,
        data: log.data,
        topics: [...log.topics] as [] | [signature: Hex, ...args: Hex[]],
      });
      if (decoded.eventName === "PolicyCreated") {
        return decoded.args.policyId;
      }
    } catch {
      continue;
    }
  }
  throw new Error(`PolicyCreated event not found in ${receipt.transactionHash}`);
}

async function signedRecordArgs(input: {
  agentId: bigint;
  policyId: bigint;
  target: Address;
  value: bigint;
  calldataHash: Hex;
  selector: Hex;
  simulationHash: Hex;
  decision: number;
  reasonCode: number;
}) {
  const nonce = (await publicClient.readContract({
    address: contracts.actionAttestation,
    abi: actionAttestationAbi,
    functionName: "nonces",
    args: [input.agentId],
  })) as bigint;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  // Smoke uses the simulationHash as a stand-in evidence commitment.
  const evidenceHash = input.simulationHash;
  const signature = await walletClient.signTypedData({
    account,
    domain: {
      name: "AgentOps",
      version: "3",
      chainId: mantleSepolia.id,
      verifyingContract: contracts.actionAttestation,
    },
    types: {
      Action: [
        { name: "agentId", type: "uint256" },
        { name: "policyId", type: "uint256" },
        { name: "target", type: "address" },
        { name: "value", type: "uint256" },
        { name: "calldataHash", type: "bytes32" },
        { name: "selector", type: "bytes4" },
        { name: "simulationHash", type: "bytes32" },
        { name: "evidenceHash", type: "bytes32" },
        { name: "decision", type: "uint8" },
        { name: "reasonCode", type: "uint8" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Action",
    message: { ...input, evidenceHash, nonce, deadline },
  });

  return [
    input.agentId,
    input.policyId,
    input.target,
    input.value,
    input.calldataHash,
    input.selector,
    input.simulationHash,
    evidenceHash,
    input.decision,
    input.reasonCode,
    deadline,
    signature,
  ] as const;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
