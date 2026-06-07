// Additive, standalone deploy: TokenGuardedExecutor against the EXISTING PolicyRegistry. It enforces
// the same policy checks as PolicyGuardedExecutor PLUS on-chain ERC-20 token rules (recipient/spender
// allowlists, max amount, unlimited-approve block). Does NOT touch any other live contract. Run with
// any funded key; the policy owner later sets token rules via setTokenRule.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";

const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
if (!privateKey || /^0x0+$/.test(privateKey)) {
  throw new Error("Set PRIVATE_KEY before deploying TokenGuardedExecutor.");
}

const artifactsDir = path.resolve(import.meta.dirname, "..", "artifacts");
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http(rpcUrl) });
const existing = deployedAddresses.mantleSepolia;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function artifact(name: string): Promise<{ abi: any[]; bytecode: `0x${string}` }> {
  return JSON.parse(await readFile(path.join(artifactsDir, `${name}.json`), "utf8"));
}

console.log(`Deployer: ${account.address}`);
console.log(`Existing PolicyRegistry: ${existing.policyRegistry}`);

const guard = await artifact("TokenGuardedExecutor");
const deployHash = await walletClient.deployContract({
  abi: guard.abi,
  bytecode: guard.bytecode,
  args: [existing.policyRegistry],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const tokenGuardedExecutor = receipt.contractAddress!;
console.log(`TokenGuardedExecutor: ${tokenGuardedExecutor} (block ${receipt.blockNumber}, tx ${deployHash})`);

console.log("\n=== WIRE THESE (addresses.ts tokenGuardedExecutor + web env) ===");
console.log(`TOKEN_GUARDED_EXECUTOR=${tokenGuardedExecutor}`);
