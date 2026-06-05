import { readFile } from "node:fs/promises";
import path from "node:path";
import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  keccak256,
  parseEther,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentRegistryAbi, actionAttestationAbi, policyRegistryAbi } from "@interlock/shared";

await import("./compile.js");

const server = ganache.server({
  chain: { hardfork: "shanghai" },
  logging: { quiet: true },
  wallet: { deterministic: true, totalAccounts: 3 },
});

await server.listen(0);

try {
  const addressInfo = server.address();
  if (typeof addressInfo === "string" || addressInfo === null) {
    throw new Error("Unexpected ganache address info.");
  }

  const rpcUrl = `http://127.0.0.1:${addressInfo.port}`;
  const chain = defineChain({
    id: 1337,
    name: "Interlock Local",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  const initialAccounts = (server.provider as any).getInitialAccounts();
  const firstAccount = Object.values(initialAccounts)[0] as { secretKey: `0x${string}` };
  const account = privateKeyToAccount(firstAccount.secretKey);

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const agentRegistry = await deploy("AgentRegistry", walletClient, publicClient);
  const policyRegistry = await deploy("PolicyRegistry", walletClient, publicClient, [agentRegistry]);
  const actionAttestation = await deploy("ActionAttestationV3", walletClient, publicClient, [
    agentRegistry,
    policyRegistry,
    account.address,
  ]);
  const testStrategyVault = await deploy("TestStrategyVault", walletClient, publicClient);
  const testStrategyRouter = await deploy("TestStrategyRouter", walletClient, publicClient);
  await wait(
    publicClient,
    await walletClient.writeContract({
      account,
      chain,
      address: agentRegistry,
      abi: agentRegistryAbi,
      functionName: "setActionAttestation",
      args: [actionAttestation],
    }),
  );

  await wait(
    publicClient,
    await walletClient.writeContract({
      account,
      chain,
      address: agentRegistry,
      abi: agentRegistryAbi,
      functionName: "registerAgent",
      args: ["ipfs://interlock-local-agent"],
    }),
  );

  const getAgentSelector = toFunctionSelector("getAgent(uint256)");
  await wait(
    publicClient,
    await walletClient.writeContract({
      account,
      chain,
      address: policyRegistry,
      abi: policyRegistryAbi,
      functionName: "createPolicy",
      args: [1n, parseEther("0.02"), 100, [agentRegistry], [getAgentSelector]],
    }),
  );

  const [policyRegistryVersion, supportsPolicyEnumeration, allowedTargets, allowedSelectors] = await Promise.all([
    publicClient.readContract({
      address: policyRegistry,
      abi: policyRegistryAbi,
      functionName: "VERSION",
    }),
    publicClient.readContract({
      address: policyRegistry,
      abi: policyRegistryAbi,
      functionName: "supportsPolicyEnumeration",
    }),
    publicClient.readContract({
      address: policyRegistry,
      abi: policyRegistryAbi,
      functionName: "getAllowedTargets",
      args: [1n],
    }),
    publicClient.readContract({
      address: policyRegistry,
      abi: policyRegistryAbi,
      functionName: "getAllowedSelectors",
      args: [1n],
    }),
  ]);

  if (policyRegistryVersion !== "1.2.0" || supportsPolicyEnumeration !== true) {
    throw new Error(`PolicyRegistry compatibility failed: version=${policyRegistryVersion}, enumeration=${supportsPolicyEnumeration}`);
  }

  if (!allowedTargets.some((target) => target.toLowerCase() === agentRegistry.toLowerCase())) {
    throw new Error("PolicyRegistry getAllowedTargets did not include AgentRegistry.");
  }

  if (!allowedSelectors.includes(getAgentSelector)) {
    throw new Error("PolicyRegistry getAllowedSelectors did not include getAgent selector.");
  }

  const getAgentData = encodeFunctionData({ abi: agentRegistryAbi, functionName: "getAgent", args: [1n] });
  const calldataHash = keccak256(getAgentData);
  const routerArtifact = await artifact("TestStrategyRouter");
  const vaultArtifact = await artifact("TestStrategyVault");
  const routeNativeDepositSelector = toFunctionSelector("routeNativeDeposit(address,address,uint16)");
  const routeNativeDepositData = encodeFunctionData({
    abi: routerArtifact.abi,
    functionName: "routeNativeDeposit",
    args: [testStrategyVault, account.address, 100],
  });

  await wait(
    publicClient,
    await walletClient.writeContract({
      account,
      chain,
      address: actionAttestation,
      abi: actionAttestationAbi,
      functionName: "recordAction",
      args: await signedRecordArgs({
        publicClient,
        walletClient,
        account,
        chain,
        actionAttestation,
        agentId: 1n,
        policyId: 1n,
        target: agentRegistry,
        value: 0n,
        calldataHash,
        selector: getAgentSelector,
        simulationHash: calldataHash,
        decision: 0,
        reasonCode: 0,
      }),
    }),
  );

  await wait(
    publicClient,
    await walletClient.writeContract({
      account,
      chain,
      address: actionAttestation,
      abi: actionAttestationAbi,
      functionName: "recordAction",
      args: await signedRecordArgs({
        publicClient,
        walletClient,
        account,
        chain,
        actionAttestation,
        agentId: 1n,
        policyId: 1n,
        target: agentRegistry,
        value: parseEther("0.25"),
        calldataHash,
        selector: getAgentSelector,
        simulationHash: calldataHash,
        decision: 1,
        reasonCode: 2,
      }),
    }),
  );

  await wait(
    publicClient,
    await walletClient.writeContract({
      account,
      chain,
      address: policyRegistry,
      abi: policyRegistryAbi,
      functionName: "createPolicy",
      args: [1n, parseEther("0.02"), 100, [testStrategyRouter], [routeNativeDepositSelector]],
    }),
  );
  await wait(
    publicClient,
    await walletClient.writeContract({
      account,
      chain,
      address: testStrategyRouter,
      abi: routerArtifact.abi,
      functionName: "routeNativeDeposit",
      args: [testStrategyVault, account.address, 100],
      value: parseEther("0.01"),
    }),
  );
  await wait(
    publicClient,
    await walletClient.writeContract({
      account,
      chain,
      address: actionAttestation,
      abi: actionAttestationAbi,
      functionName: "recordAction",
      args: await signedRecordArgs({
        publicClient,
        walletClient,
        account,
        chain,
        actionAttestation,
        agentId: 1n,
        policyId: 2n,
        target: testStrategyRouter,
        value: parseEther("0.01"),
        calldataHash: keccak256(routeNativeDepositData),
        selector: routeNativeDepositSelector,
        simulationHash: keccak256(routeNativeDepositData),
        decision: 0,
        reasonCode: 0,
      }),
    }),
  );

  const testStrategyAssets = await publicClient.readContract({
    address: testStrategyVault,
    abi: vaultArtifact.abi,
    functionName: "totalAssets",
  });

  const agent = await publicClient.readContract({
    address: agentRegistry,
    abi: agentRegistryAbi,
    functionName: "getAgent",
    args: [1n],
  });

  console.log("Local smoke test passed");
  console.table([
    { contract: "AgentRegistry", address: agentRegistry },
    { contract: "PolicyRegistry", address: policyRegistry },
    { contract: "ActionAttestationV3", address: actionAttestation },
    { contract: "TestStrategyVault", address: testStrategyVault },
    { contract: "TestStrategyRouter", address: testStrategyRouter },
  ]);
  console.log({
    policyRegistryVersion,
    supportsPolicyEnumeration,
    allowedTargetCount: allowedTargets.length,
    allowedSelectorCount: allowedSelectors.length,
    allowedActions: agent.allowedActions.toString(),
    blockedActions: agent.blockedActions.toString(),
    failedSimulations: agent.failedSimulations.toString(),
    testStrategyAssets: String(testStrategyAssets),
  });
} finally {
  await server.close();
}

async function deploy(name: string, walletClient: any, publicClient: any, args: readonly unknown[] = []) {
  const item = await artifact(name);
  const hash = await walletClient.deployContract({
    abi: item.abi,
    bytecode: item.bytecode,
    args,
  });
  const receipt = await wait(publicClient, hash);
  return receipt.contractAddress;
}

async function artifact(name: string) {
  return JSON.parse(
    await readFile(path.resolve(import.meta.dirname, "..", "artifacts", `${name}.json`), "utf8"),
  );
}

async function wait(publicClient: any, hash: `0x${string}`) {
  return publicClient.waitForTransactionReceipt({ hash });
}

async function signedRecordArgs(input: {
  publicClient: any;
  walletClient: any;
  account: ReturnType<typeof privateKeyToAccount>;
  chain: ReturnType<typeof defineChain>;
  actionAttestation: Address;
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
  const nonce = (await input.publicClient.readContract({
    address: input.actionAttestation,
    abi: actionAttestationAbi,
    functionName: "nonces",
    args: [input.agentId],
  })) as bigint;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  // Smoke uses the simulationHash as a stand-in evidence commitment.
  const evidenceHash = input.simulationHash;
  const signature = await input.walletClient.signTypedData({
    account: input.account,
    domain: {
      name: "AgentOps",
      version: "3",
      chainId: input.chain.id,
      verifyingContract: input.actionAttestation,
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
    message: {
      agentId: input.agentId,
      policyId: input.policyId,
      target: input.target,
      value: input.value,
      calldataHash: input.calldataHash,
      selector: input.selector,
      simulationHash: input.simulationHash,
      evidenceHash,
      decision: input.decision,
      reasonCode: input.reasonCode,
      nonce,
      deadline,
    },
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
