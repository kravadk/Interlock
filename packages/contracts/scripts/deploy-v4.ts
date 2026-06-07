// Non-destructive V4 upgrade: deploys ONLY ActionAttestationV4 (committee-verified recording)
// against the EXISTING AgentRegistry + PolicyRegistry + AttestorCommittee, then re-points
// AgentRegistry.setActionAttestation(v4). Existing agents, policies, and prior history are
// preserved. recordAction now requires >= threshold distinct committee signatures instead of a
// single attestor. Run with the deployer key that owns AgentRegistry.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";

const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
if (!privateKey || /^0x0+$/.test(privateKey)) {
  throw new Error("Set PRIVATE_KEY (the AgentRegistry owner) before deploying V4.");
}

const artifactsDir = path.resolve(import.meta.dirname, "..", "artifacts");
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http(rpcUrl) });

const existing = deployedAddresses.mantleSepolia;
const committee =
  (process.env.ATTESTOR_COMMITTEE as Address | undefined) ?? existing.attestorCommittee;
if (!committee) {
  throw new Error("No AttestorCommittee address. Deploy it (deploy-extras.ts) or set ATTESTOR_COMMITTEE.");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function artifact(name: string): Promise<{ abi: any[]; bytecode: `0x${string}` }> {
  return JSON.parse(await readFile(path.join(artifactsDir, `${name}.json`), "utf8"));
}

console.log(`Deployer: ${account.address}`);
console.log(`Existing AgentRegistry: ${existing.agentRegistry}`);
console.log(`Existing PolicyRegistry: ${existing.policyRegistry}`);
console.log(`AttestorCommittee: ${committee}`);

const v4 = await artifact("ActionAttestationV4");
const deployHash = await walletClient.deployContract({
  abi: v4.abi,
  bytecode: v4.bytecode,
  args: [existing.agentRegistry, existing.policyRegistry, committee],
});
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const actionAttestationV4 = deployReceipt.contractAddress!;
console.log(`ActionAttestationV4: ${actionAttestationV4} (block ${deployReceipt.blockNumber}, tx ${deployHash})`);

const agentArtifact = await artifact("AgentRegistry");
const repointHash = await walletClient.writeContract({
  address: existing.agentRegistry,
  abi: agentArtifact.abi,
  functionName: "setActionAttestation",
  args: [actionAttestationV4],
});
await publicClient.waitForTransactionReceipt({ hash: repointHash });
console.log(`setActionAttestation(v4) confirmed (tx ${repointHash})`);

console.log("\n=== WIRE THESE (addresses.ts actionAttestationV4 + indexer/web) ===");
console.log(`ACTION_ATTESTATION=${actionAttestationV4}`);
console.log(`FROM_BLOCK=${deployReceipt.blockNumber.toString()}`);
console.log(`committee=${committee}`);
