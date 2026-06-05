import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";

/**
 * Standalone DisputeEscrow deploy. Deploys the escrow (arbiter = ATTESTOR_ADDRESS or the deployer)
 * and patches packages/shared/src/addresses.ts with `disputeEscrow` — preserving every other live
 * address (incl. policyGuardedExecutor). Run:
 *   node scripts/env-run.mjs pnpm --filter @interlock/contracts exec tsx scripts/deploy-dispute.ts
 */

const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000") {
  throw new Error("Set PRIVATE_KEY before deploying the dispute escrow.");
}

const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const account = privateKeyToAccount(privateKey);
const arbiter = (process.env.ATTESTOR_ADDRESS as Address | undefined) ?? account.address;

const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http(rpcUrl) });

const artifactPath = path.resolve(import.meta.dirname, "..", "artifacts", "DisputeEscrow.json");
const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as { abi: any[]; bytecode: `0x${string}` };

console.log(`Deploying DisputeEscrow(arbiter=${arbiter}) from ${account.address}…`);
const hash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [arbiter] });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
const escrow = receipt.contractAddress!;
console.log(`DisputeEscrow: ${escrow}`);
console.log(`  tx: ${hash}  block: ${receipt.blockNumber}`);

const a = deployedAddresses.mantleSepolia;
const line = (key: string, value?: string) => (value ? `\n    ${key}: "${value}" as Address,` : "");
const sharedAddressesPath = path.resolve(import.meta.dirname, "..", "..", "shared", "src", "addresses.ts");
await writeFile(
  sharedAddressesPath,
  `import type { Address } from "viem";\n\nexport type InterlockDeploymentAddresses = {\n  agentRegistry: Address;\n  policyRegistry: Address;\n  actionAttestation: Address;\n  policyGuardedExecutor?: Address;\n  disputeEscrow?: Address;\n  testStrategyVault?: Address;\n  testStrategyRouter?: Address;\n};\n\nexport const deployedAddresses: { mantleSepolia: InterlockDeploymentAddresses } = {\n  mantleSepolia: {\n    agentRegistry: "${a.agentRegistry}" as Address,\n    policyRegistry: "${a.policyRegistry}" as Address,\n    actionAttestation: "${a.actionAttestation}" as Address,${line("policyGuardedExecutor", a.policyGuardedExecutor)}\n    disputeEscrow: "${escrow}" as Address,\n  },\n};\n`,
);
console.log("Patched packages/shared/src/addresses.ts with disputeEscrow.");
