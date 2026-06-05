import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";

/**
 * Standalone deploy for the Phase 11 extras: AttestorCommittee (demo committee = [deployer], m=1)
 * and ReputationOracle (reads the live AgentRegistry). Patches packages/shared/src/addresses.ts,
 * preserving every other live address (guard + escrow). Run:
 *   node scripts/env-run.mjs pnpm --filter @interlock/contracts exec tsx scripts/deploy-extras.ts
 */

const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000") {
  throw new Error("Set PRIVATE_KEY before deploying.");
}

const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const account = privateKeyToAccount(privateKey);
const committeeMember = (process.env.ATTESTOR_ADDRESS as Address | undefined) ?? account.address;
const a = deployedAddresses.mantleSepolia;

const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http(rpcUrl) });

async function deploy(name: string, args: readonly unknown[]) {
  const item = JSON.parse(
    await readFile(path.resolve(import.meta.dirname, "..", "artifacts", `${name}.json`), "utf8"),
  ) as { abi: any[]; bytecode: `0x${string}` };
  const hash = await walletClient.deployContract({ abi: item.abi, bytecode: item.bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`${name}: ${receipt.contractAddress} (block ${receipt.blockNumber})`);
  return receipt.contractAddress! as Address;
}

console.log(`Deploying AttestorCommittee + ReputationOracle from ${account.address}…`);
const attestorCommittee = await deploy("AttestorCommittee", [[committeeMember], 1n]);
const reputationOracle = await deploy("ReputationOracle", [a.agentRegistry]);

const line = (key: string, value?: string) => (value ? `\n    ${key}: "${value}" as Address,` : "");
const sharedAddressesPath = path.resolve(import.meta.dirname, "..", "..", "shared", "src", "addresses.ts");
await writeFile(
  sharedAddressesPath,
  `import type { Address } from "viem";\n\nexport type InterlockDeploymentAddresses = {\n  agentRegistry: Address;\n  policyRegistry: Address;\n  actionAttestation: Address;\n  policyGuardedExecutor?: Address;\n  disputeEscrow?: Address;\n  attestorCommittee?: Address;\n  reputationOracle?: Address;\n  testStrategyVault?: Address;\n  testStrategyRouter?: Address;\n};\n\nexport const deployedAddresses: { mantleSepolia: InterlockDeploymentAddresses } = {\n  mantleSepolia: {\n    agentRegistry: "${a.agentRegistry}" as Address,\n    policyRegistry: "${a.policyRegistry}" as Address,\n    actionAttestation: "${a.actionAttestation}" as Address,${line("policyGuardedExecutor", a.policyGuardedExecutor)}${line("disputeEscrow", a.disputeEscrow)}\n    attestorCommittee: "${attestorCommittee}" as Address,\n    reputationOracle: "${reputationOracle}" as Address,\n  },\n};\n`,
);
console.log("Patched packages/shared/src/addresses.ts with attestorCommittee + reputationOracle.");
