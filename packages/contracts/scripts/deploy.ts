import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, createWalletClient, http, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantleSepolia, policyRegistryAbi } from "@interlock/shared";

type Artifact = {
  abi: any[];
  bytecode: `0x${string}`;
};

const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];

if (!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000") {
  throw new Error("Set PRIVATE_KEY in your environment before deploying.");
}

const artifactsDir = path.resolve(import.meta.dirname, "..", "artifacts");
const deploymentsDir = path.resolve(import.meta.dirname, "..", "..", "..", "deployments", "mantle-sepolia");
const sharedAddressesPath = path.resolve(import.meta.dirname, "..", "..", "shared", "src", "addresses.ts");

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http(rpcUrl) });
const deployTestStrategyContracts = process.env.DEPLOY_TEST_STRATEGY_CONTRACTS === "true";

async function artifact(name: string): Promise<Artifact> {
  return JSON.parse(await readFile(path.join(artifactsDir, `${name}.json`), "utf8"));
}

async function deploy(name: string, args: readonly unknown[] = []) {
  const item = await artifact(name);
  const hash = await walletClient.deployContract({
    abi: item.abi,
    bytecode: item.bytecode,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`${name}: ${receipt.contractAddress} (${hash})`);
  return {
    address: receipt.contractAddress!,
    transactionHash: hash,
    blockNumber: receipt.blockNumber,
  };
}

const attestorAddress = (process.env.ATTESTOR_ADDRESS as Address | undefined) ?? account.address;
const agentRegistry = await deploy("AgentRegistry");
const policyRegistry = await deploy("PolicyRegistry", [agentRegistry.address]);
const actionAttestation = await deploy("ActionAttestationV3", [
  agentRegistry.address,
  policyRegistry.address,
  attestorAddress,
]);
const policyGuardedExecutor = await deploy("PolicyGuardedExecutor", [policyRegistry.address]);
const testStrategyVault = deployTestStrategyContracts ? await deploy("TestStrategyVault") : undefined;
const testStrategyRouter = deployTestStrategyContracts ? await deploy("TestStrategyRouter") : undefined;

const agentArtifact = await artifact("AgentRegistry");
const setActionAttestationHash = await walletClient.writeContract({
  address: agentRegistry.address,
  abi: agentArtifact.abi,
  functionName: "setActionAttestation",
  args: [actionAttestation.address],
});
const setActionAttestationReceipt = await publicClient.waitForTransactionReceipt({ hash: setActionAttestationHash });

const addresses: {
  agentRegistry: Address;
  policyRegistry: Address;
  actionAttestation: Address;
  policyGuardedExecutor: Address;
  testStrategyVault?: Address;
  testStrategyRouter?: Address;
} = {
  agentRegistry: agentRegistry.address,
  policyRegistry: policyRegistry.address,
  actionAttestation: actionAttestation.address,
  policyGuardedExecutor: policyGuardedExecutor.address,
  ...(testStrategyVault ? { testStrategyVault: testStrategyVault.address } : {}),
  ...(testStrategyRouter ? { testStrategyRouter: testStrategyRouter.address } : {}),
};

const [policyRegistryVersion, supportsPolicyEnumeration] = await Promise.all([
  publicClient.readContract({
    address: policyRegistry.address,
    abi: policyRegistryAbi,
    functionName: "VERSION",
  }),
  publicClient.readContract({
    address: policyRegistry.address,
    abi: policyRegistryAbi,
    functionName: "supportsPolicyEnumeration",
  }),
]);

if (policyRegistryVersion !== "1.2.0" || supportsPolicyEnumeration !== true) {
  throw new Error(`Unexpected PolicyRegistry compatibility: version=${policyRegistryVersion}, enumeration=${supportsPolicyEnumeration}`);
}

await writeFile(
  sharedAddressesPath,
  `import type { Address } from "viem";\n\nexport type InterlockDeploymentAddresses = {\n  agentRegistry: Address;\n  policyRegistry: Address;\n  actionAttestation: Address;\n  policyGuardedExecutor?: Address;\n  testStrategyVault?: Address;\n  testStrategyRouter?: Address;\n};\n\nexport const deployedAddresses: { mantleSepolia: InterlockDeploymentAddresses } = {\n  mantleSepolia: {\n    agentRegistry: "${addresses.agentRegistry}" as Address,\n    policyRegistry: "${addresses.policyRegistry}" as Address,\n    actionAttestation: "${addresses.actionAttestation}" as Address,\n    policyGuardedExecutor: "${addresses.policyGuardedExecutor}" as Address,${addresses.testStrategyVault ? `\n    testStrategyVault: "${addresses.testStrategyVault}" as Address,` : ""}${addresses.testStrategyRouter ? `\n    testStrategyRouter: "${addresses.testStrategyRouter}" as Address,` : ""}\n  },\n};\n`,
);

await mkdir(deploymentsDir, { recursive: true });
await writeFile(
  path.join(deploymentsDir, "latest.json"),
  `${JSON.stringify(
    {
      chain: "mantleSepolia",
      chainId: mantleSepolia.id,
      rpcUrl,
      deployedAt: new Date().toISOString(),
      deployer: account.address,
      addresses,
      compatibility: {
        policyRegistry: {
          version: policyRegistryVersion,
          supportsPolicyEnumeration,
        },
      },
      transactions: {
        agentRegistry: agentRegistry.transactionHash,
        policyRegistry: policyRegistry.transactionHash,
        actionAttestation: actionAttestation.transactionHash,
        policyGuardedExecutor: policyGuardedExecutor.transactionHash,
        setActionAttestation: setActionAttestationHash,
        ...(testStrategyVault ? { testStrategyVault: testStrategyVault.transactionHash } : {}),
        ...(testStrategyRouter ? { testStrategyRouter: testStrategyRouter.transactionHash } : {}),
      },
      blocks: {
        agentRegistry: agentRegistry.blockNumber.toString(),
        policyRegistry: policyRegistry.blockNumber.toString(),
        actionAttestation: actionAttestation.blockNumber.toString(),
        policyGuardedExecutor: policyGuardedExecutor.blockNumber.toString(),
        setActionAttestation: setActionAttestationReceipt.blockNumber.toString(),
        ...(testStrategyVault ? { testStrategyVault: testStrategyVault.blockNumber.toString() } : {}),
        ...(testStrategyRouter ? { testStrategyRouter: testStrategyRouter.blockNumber.toString() } : {}),
      },
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  path.join(deploymentsDir, "latest.env"),
  deploymentEnv(addresses, rpcUrl, agentRegistry.blockNumber),
);

console.log(`Deployment complete from ${account.address}. Example safe max value: ${parseEther("0.01")} wei`);
console.log(`Deployment manifest: ${path.join(deploymentsDir, "latest.json")}`);
console.log(`Deployment env: ${path.join(deploymentsDir, "latest.env")}`);

function deploymentEnv(deploymentAddresses: typeof addresses, rpcUrl: string, fromBlock: bigint) {
  return `MANTLE_RPC_URL=${rpcUrl}
AGENT_REGISTRY=${deploymentAddresses.agentRegistry}
POLICY_REGISTRY=${deploymentAddresses.policyRegistry}
ACTION_ATTESTATION=${deploymentAddresses.actionAttestation}
POLICY_GUARDED_EXECUTOR=${deploymentAddresses.policyGuardedExecutor}
NEXT_PUBLIC_MANTLE_RPC_URL=${rpcUrl}
NEXT_PUBLIC_AGENT_REGISTRY=${deploymentAddresses.agentRegistry}
NEXT_PUBLIC_POLICY_REGISTRY=${deploymentAddresses.policyRegistry}
NEXT_PUBLIC_ACTION_ATTESTATION=${deploymentAddresses.actionAttestation}
NEXT_PUBLIC_POLICY_GUARDED_EXECUTOR=${deploymentAddresses.policyGuardedExecutor}
${deploymentAddresses.testStrategyVault ? `TEST_STRATEGY_VAULT=${deploymentAddresses.testStrategyVault}\nNEXT_PUBLIC_TEST_STRATEGY_VAULT=${deploymentAddresses.testStrategyVault}\n` : ""}${deploymentAddresses.testStrategyRouter ? `TEST_STRATEGY_ROUTER=${deploymentAddresses.testStrategyRouter}\nNEXT_PUBLIC_TEST_STRATEGY_ROUTER=${deploymentAddresses.testStrategyRouter}\n` : ""}NEXT_PUBLIC_INDEXER_URL=
NEXT_PUBLIC_DEFAULT_AGENT_ID=
NEXT_PUBLIC_DEFAULT_POLICY_ID=
NEXT_PUBLIC_DEFAULT_ACTION_TARGET=${deploymentAddresses.agentRegistry}
NEXT_PUBLIC_DEFAULT_SELECTOR=0x2de5aaf7
INDEXER_URL=
FROM_BLOCK=${fromBlock.toString()}
INDEXER_DB_PATH=.interlock-indexer-${deploymentAddresses.actionAttestation.toLowerCase().slice(2, 10)}.sqlite
PORT=8787
AUTO_SYNC=true
SYNC_INTERVAL_MS=60000
INDEXER_BLOCK_CHUNK_SIZE=9000
`;
}
