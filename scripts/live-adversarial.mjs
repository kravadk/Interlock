import { createPublicClient, createWalletClient, decodeEventLog, http, isAddress, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  actionAttestationAbi,
  agentRegistryAbi,
  deployedAddresses,
  Decision,
  mantleSepolia,
  policyRegistryAbi,
  ReasonCode,
} from "../packages/shared/dist/index.js";

const zeroAddress = "0x0000000000000000000000000000000000000000";
const privateKey = process.env.PRIVATE_KEY;
const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const contracts = {
  agentRegistry: envAddress("AGENT_REGISTRY", deployedAddresses.mantleSepolia.agentRegistry),
  policyRegistry: envAddress("POLICY_REGISTRY", deployedAddresses.mantleSepolia.policyRegistry),
  actionAttestation: envAddress("ACTION_ATTESTATION", deployedAddresses.mantleSepolia.actionAttestation),
};

if (!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000") {
  throw new Error("Set PRIVATE_KEY before running live adversarial tests.");
}

for (const [name, address] of Object.entries(contracts)) {
  if (!isAddress(address) || address === zeroAddress) {
    throw new Error(`Missing ${name}.`);
  }
}

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http(rpcUrl) });

const registerHash = await walletClient.writeContract({
  account,
  chain: mantleSepolia,
  address: contracts.agentRegistry,
  abi: agentRegistryAbi,
  functionName: "registerAgent",
  args: [`ipfs://interlock-live-adversarial-${Date.now()}`],
});
const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });
const agentId = decodeEventArg(registerReceipt, contracts.agentRegistry, agentRegistryAbi, "AgentRegistered", "agentId");
const selector = "0x2de5aaf7";

await expectRevert(
  () =>
    walletClient.writeContract({
      account,
      chain: mantleSepolia,
      address: contracts.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "createPolicy",
      args: [agentId, 0n, 10_001, [contracts.agentRegistry], [selector]],
    }),
  "PolicyRegistry accepted maxSlippageBps above 10000.",
);

const policyHash = await walletClient.writeContract({
  account,
  chain: mantleSepolia,
  address: contracts.policyRegistry,
  abi: policyRegistryAbi,
  functionName: "createPolicy",
  args: [agentId, 0n, 100, [contracts.agentRegistry], [selector]],
});
const policyReceipt = await publicClient.waitForTransactionReceipt({ hash: policyHash });
const policyId = decodeEventArg(policyReceipt, contracts.policyRegistry, policyRegistryAbi, "PolicyCreated", "policyId");
const hash = keccak256("0x1234");

await expectRevert(
  () =>
    walletClient.writeContract({
      account,
      chain: mantleSepolia,
      address: contracts.actionAttestation,
      abi: actionAttestationAbi,
      functionName: "recordAction",
      args: [
        agentId,
        policyId,
        contracts.agentRegistry,
        0n,
        hash,
        selector,
        hash,
        hash,
        Decision.ALLOW,
        ReasonCode.SIMULATION_FAILED,
        BigInt(Math.floor(Date.now() / 1000) + 3600),
        "0x",
      ],
    }),
  "ActionAttestation accepted ALLOW with SIMULATION_FAILED.",
);

await expectRevert(
  () =>
    walletClient.writeContract({
      account,
      chain: mantleSepolia,
      address: contracts.actionAttestation,
      abi: actionAttestationAbi,
      functionName: "recordAction",
      args: [
        agentId,
        policyId,
        zeroAddress,
        0n,
        hash,
        selector,
        hash,
        hash,
        Decision.BLOCK,
        ReasonCode.TARGET_NOT_ALLOWED,
        BigInt(Math.floor(Date.now() / 1000) + 3600),
        "0x",
      ],
    }),
  "ActionAttestation accepted empty target.",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      agentId: agentId.toString(),
      policyId: policyId.toString(),
      checks: ["maxSlippageBps>10000 reverted", "ALLOW+SIMULATION_FAILED reverted", "empty target reverted"],
    },
    null,
    2,
  ),
);

async function expectRevert(operation, message) {
  try {
    const hash = await operation();
    await publicClient.waitForTransactionReceipt({ hash });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (text.includes("ABI encoding") || text.includes("params/values length mismatch")) {
      throw error;
    }
    return;
  }
  throw new Error(message);
}

function decodeEventArg(receipt, address, abi, eventName, argName) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== address.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi,
        eventName,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === eventName && decoded.args?.[argName] !== undefined) {
        return decoded.args[argName];
      }
    } catch {
      // Ignore logs from the same address that do not match the target event.
    }
  }
  throw new Error(`${eventName} event not found in receipt.`);
}

function envAddress(key, fallback) {
  const value = process.env[key] ?? fallback;
  if (!isAddress(value)) return zeroAddress;
  return value;
}
