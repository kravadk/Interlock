import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";

/**
 * Guard-only deploy. Deploys PolicyGuardedExecutor pointing at the EXISTING PolicyRegistry and
 * patches packages/shared/src/addresses.ts with the new `policyGuardedExecutor` address — without
 * touching the other live contracts or their on-chain state. Run:
 *   node scripts/env-run.mjs pnpm --filter @interlock/contracts exec tsx scripts/deploy-guard.ts
 */

const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000") {
  throw new Error("Set PRIVATE_KEY before deploying the guard.");
}

const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const policyRegistry = (process.env.POLICY_REGISTRY as Address | undefined) ?? deployedAddresses.mantleSepolia.policyRegistry;

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http(rpcUrl) });

const artifactPath = path.resolve(import.meta.dirname, "..", "artifacts", "PolicyGuardedExecutor.json");
const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as { abi: any[]; bytecode: `0x${string}` };

console.log(`Deploying PolicyGuardedExecutor(policyRegistry=${policyRegistry}) from ${account.address}…`);
const hash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [policyRegistry] });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
const guard = receipt.contractAddress!;
console.log(`PolicyGuardedExecutor: ${guard}`);
console.log(`  tx: ${hash}  block: ${receipt.blockNumber}`);

const a = deployedAddresses.mantleSepolia;
const sharedAddressesPath = path.resolve(import.meta.dirname, "..", "..", "shared", "src", "addresses.ts");
await writeFile(
  sharedAddressesPath,
  `import type { Address } from "viem";\n\nexport type InterlockDeploymentAddresses = {\n  agentRegistry: Address;\n  policyRegistry: Address;\n  actionAttestation: Address;\n  policyGuardedExecutor?: Address;\n  testStrategyVault?: Address;\n  testStrategyRouter?: Address;\n};\n\nexport const deployedAddresses: { mantleSepolia: InterlockDeploymentAddresses } = {\n  mantleSepolia: {\n    agentRegistry: "${a.agentRegistry}" as Address,\n    policyRegistry: "${a.policyRegistry}" as Address,\n    actionAttestation: "${a.actionAttestation}" as Address,\n    policyGuardedExecutor: "${guard}" as Address,\n  },\n};\n`,
);
console.log("Patched packages/shared/src/addresses.ts with policyGuardedExecutor.");
