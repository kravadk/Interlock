// Non-destructive V3 upgrade: deploys ONLY ActionAttestationV3 against the EXISTING
// AgentRegistry + PolicyRegistry, then re-points AgentRegistry.setActionAttestation(v3).
// Existing agents, policies, and prior attestation history are preserved. Run with the
// deployer key that owns AgentRegistry. Prints the new address + deploy block for wiring.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";

const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
if (!privateKey || /^0x0+$/.test(privateKey)) {
  throw new Error("Set PRIVATE_KEY (the AgentRegistry owner) before deploying V3.");
}

const artifactsDir = path.resolve(import.meta.dirname, "..", "artifacts");
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http(rpcUrl) });

const existing = deployedAddresses.mantleSepolia;
const attestorAddress = (process.env.ATTESTOR_ADDRESS as Address | undefined) ?? account.address;

async function artifact(name: string): Promise<{ abi: any[]; bytecode: `0x${string}` }> {
  return JSON.parse(await readFile(path.join(artifactsDir, `${name}.json`), "utf8"));
}

console.log(`Deployer: ${account.address}`);
console.log(`Existing AgentRegistry: ${existing.agentRegistry}`);
console.log(`Existing PolicyRegistry: ${existing.policyRegistry}`);
console.log(`Previous ActionAttestation: ${existing.actionAttestation}`);

const v3 = await artifact("ActionAttestationV3");
const deployHash = await walletClient.deployContract({
  abi: v3.abi,
  bytecode: v3.bytecode,
  args: [existing.agentRegistry, existing.policyRegistry, attestorAddress],
});
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const actionAttestationV3 = deployReceipt.contractAddress!;
console.log(`ActionAttestationV3: ${actionAttestationV3} (block ${deployReceipt.blockNumber}, tx ${deployHash})`);

const agentArtifact = await artifact("AgentRegistry");
const repointHash = await walletClient.writeContract({
  address: existing.agentRegistry,
  abi: agentArtifact.abi,
  functionName: "setActionAttestation",
  args: [actionAttestationV3],
});
await publicClient.waitForTransactionReceipt({ hash: repointHash });
console.log(`setActionAttestation(v3) confirmed (tx ${repointHash})`);

console.log("\n=== WIRE THESE ===");
console.log(`ACTION_ATTESTATION=${actionAttestationV3}`);
console.log(`FROM_BLOCK=${deployReceipt.blockNumber.toString()}`);
console.log(`attestor=${attestorAddress}`);
