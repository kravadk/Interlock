import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentRegistryAbi, policyRegistryAbi } from "@interlock/shared";

type TestContext = Awaited<ReturnType<typeof createContext>>;

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createContext();
});

afterEach(async () => {
  await ctx.close();
});

describe("Interlock contracts", () => {
  it("registers an agent and creates a policy", async () => {
    const deployment = await deployCore(ctx);
    await registerAgent(ctx, deployment.agentRegistry);
    await createPolicy(ctx, deployment);

    const agent = await ctx.publicClient.readContract({
      address: deployment.agentRegistry,
      abi: agentRegistryAbi,
      functionName: "getAgent",
      args: [1n],
    });

    const policy = await ctx.publicClient.readContract({
      address: deployment.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "getPolicy",
      args: [1n],
    });
    const supportsPolicyEnumeration = await ctx.publicClient.readContract({
      address: deployment.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "supportsPolicyEnumeration",
    });
    const version = await ctx.publicClient.readContract({
      address: deployment.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "VERSION",
    });

    expect(agent.owner.toLowerCase()).toBe(ctx.account.address.toLowerCase());
    expect(agent.metadataURI).toBe("ipfs://interlock-test-agent");
    expect(policy.agentId).toBe(1n);
    expect(policy.maxNativeValue).toBe(parseEther("0.02"));
    expect(policy.active).toBe(true);
    expect(supportsPolicyEnumeration).toBe(true);
    expect(version).toBe("1.2.0");
  });

  it("rejects policy slippage above 10000 bps", async () => {
    const deployment = await deployCore(ctx);
    await registerAgent(ctx, deployment.agentRegistry);

    await expect(
      ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: deployment.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "createPolicy",
        args: [1n, parseEther("0.02"), 10_001, [deployment.agentRegistry], [toFunctionSelector("getAgent(uint256)")]],
      }),
    ).rejects.toThrow();

    await createPolicy(ctx, deployment);
    await expect(
      ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: deployment.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "updatePolicy",
        args: [1n, parseEther("0.02"), 10_001, true],
      }),
    ).rejects.toThrow();
  });

  it("rejects policy updates from non-owners", async () => {
    const deployment = await deployCore(ctx);
    await registerAgent(ctx, deployment.agentRegistry);
    await createPolicy(ctx, deployment);

    await expect(
      ctx.walletClient2.writeContract({
        account: ctx.account2,
        chain: ctx.chain,
        address: deployment.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "updatePolicy",
        args: [1n, parseEther("1"), 500, true],
      }),
    ).rejects.toThrow();
  });

  it("enumerates target and selector allowlists and removes denied entries", async () => {
    const deployment = await deployCore(ctx);
    await registerAgent(ctx, deployment.agentRegistry);
    await createPolicy(ctx, deployment);

    const getAgentSelector = toFunctionSelector("getAgent(uint256)");
    const ownerOfSelector = toFunctionSelector("ownerOf(uint256)");

    await wait(
      ctx,
      await ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: deployment.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "setTargetAllowed",
        args: [1n, ctx.account2.address, true],
      }),
    );
    await wait(
      ctx,
      await ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: deployment.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "setSelectorAllowed",
        args: [1n, ownerOfSelector, true],
      }),
    );

    let targets = await ctx.publicClient.readContract({
      address: deployment.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "getAllowedTargets",
      args: [1n],
    });
    let selectors = await ctx.publicClient.readContract({
      address: deployment.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "getAllowedSelectors",
      args: [1n],
    });

    expect(targets.map((target) => target.toLowerCase()).sort()).toEqual([deployment.agentRegistry, ctx.account2.address].map((target) => target.toLowerCase()).sort());
    expect(selectors.sort()).toEqual([getAgentSelector, ownerOfSelector].sort());

    await wait(
      ctx,
      await ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: deployment.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "setTargetAllowed",
        args: [1n, deployment.agentRegistry, false],
      }),
    );
    await wait(
      ctx,
      await ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: deployment.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "setSelectorAllowed",
        args: [1n, getAgentSelector, false],
      }),
    );

    targets = await ctx.publicClient.readContract({
      address: deployment.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "getAllowedTargets",
      args: [1n],
    });
    selectors = await ctx.publicClient.readContract({
      address: deployment.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "getAllowedSelectors",
      args: [1n],
    });

    expect(targets.map((target) => target.toLowerCase())).toEqual([ctx.account2.address.toLowerCase()]);
    expect(selectors).toEqual([ownerOfSelector]);
  });

  it("records allow and block attestations and updates reputation", async () => {
    const deployment = await deployCore(ctx);
    await registerAgent(ctx, deployment.agentRegistry);
    await createPolicy(ctx, deployment);

    const calldataHash = keccak256("0x1234");
    const selector = toFunctionSelector("getAgent(uint256)");
    await recordAction(ctx, deployment, {
      value: parseEther("0.01"),
      decision: 0,
      reasonCode: 0,
      calldataHash,
      selector,
    });
    await recordAction(ctx, deployment, {
      value: parseEther("0.25"),
      decision: 1,
      reasonCode: 2,
      calldataHash,
      selector,
    });
    await recordAction(ctx, deployment, {
      value: 0n,
      decision: 1,
      reasonCode: 4,
      calldataHash,
      selector,
    });

    const agent = await ctx.publicClient.readContract({
      address: deployment.agentRegistry,
      abi: agentRegistryAbi,
      functionName: "getAgent",
      args: [1n],
    });

    expect(agent.allowedActions).toBe(1n);
    expect(agent.blockedActions).toBe(2n);
    expect(agent.failedSimulations).toBe(1n);
  });

  it("rejects allow attestations that violate target or value policy", async () => {
    const deployment = await deployCore(ctx);
    await registerAgent(ctx, deployment.agentRegistry);
    await createPolicy(ctx, deployment);

    const calldataHash = keccak256("0x1234");
    const selector = toFunctionSelector("getAgent(uint256)");

    await expect(
      recordAction(ctx, deployment, {
        target: ctx.account2.address,
        value: parseEther("0.01"),
        decision: 0,
        reasonCode: 0,
        calldataHash,
        selector,
      }),
    ).rejects.toThrow();

    await expect(
      recordAction(ctx, deployment, {
        value: parseEther("0.25"),
        decision: 0,
        reasonCode: 0,
        calldataHash,
        selector,
      }),
    ).rejects.toThrow();

    await expect(
      recordAction(ctx, deployment, {
        value: parseEther("0.01"),
        decision: 0,
        reasonCode: 0,
        calldataHash,
        selector: toFunctionSelector("ownerOf(uint256)"),
      }),
    ).rejects.toThrow();

    await recordAction(ctx, deployment, {
      target: ctx.account2.address,
      value: parseEther("0.25"),
      decision: 1,
      reasonCode: 1,
      calldataHash,
      selector: toFunctionSelector("ownerOf(uint256)"),
    });

    const agent = await ctx.publicClient.readContract({
      address: deployment.agentRegistry,
      abi: agentRegistryAbi,
      functionName: "getAgent",
      args: [1n],
    });

    expect(agent.allowedActions).toBe(0n);
    expect(agent.blockedActions).toBe(1n);
  });

  it("rejects invalid attestation decision and reason combinations", async () => {
    const deployment = await deployCore(ctx);
    await registerAgent(ctx, deployment.agentRegistry);
    await createPolicy(ctx, deployment);

    const calldataHash = keccak256("0x1234");
    const selector = toFunctionSelector("getAgent(uint256)");

    await expect(
      recordAction(ctx, deployment, {
        value: 0n,
        decision: 0,
        reasonCode: 4,
        calldataHash,
        selector,
      }),
    ).rejects.toThrow();

    await expect(
      recordAction(ctx, deployment, {
        value: 0n,
        decision: 1,
        reasonCode: 0,
        calldataHash,
        selector,
      }),
    ).rejects.toThrow();
  });

  it("rejects attestation records with an empty target", async () => {
    const deployment = await deployCore(ctx);
    await registerAgent(ctx, deployment.agentRegistry);
    await createPolicy(ctx, deployment);

    await expect(
      recordAction(ctx, deployment, {
        target: zeroAddress,
        value: 0n,
        decision: 1,
        reasonCode: 1,
        calldataHash: keccak256("0x1234"),
        selector: toFunctionSelector("getAgent(uint256)"),
      }),
    ).rejects.toThrow();
  });

  it("supports a real test strategy router/vault flow for Mantle pack demos", async () => {
    const deployment = await deployCore(ctx);
    const testVault = await deploy(ctx, "TestStrategyVault");
    const testRouter = await deploy(ctx, "TestStrategyRouter");
    const vaultAbi = await abi("TestStrategyVault");
    const routerAbi = await abi("TestStrategyRouter");
    const routeSelector = toFunctionSelector("routeNativeDeposit(address,address,uint16)");

    await registerAgent(ctx, deployment.agentRegistry);
    await wait(
      ctx,
      await ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: deployment.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "createPolicy",
        args: [1n, parseEther("0.02"), 100, [testRouter], [routeSelector]],
      }),
    );

    const routeCalldata = encodeFunctionData({
      abi: routerAbi,
      functionName: "routeNativeDeposit",
      args: [testVault, ctx.account2.address, 100],
    });
    await wait(
      ctx,
      await ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: testRouter,
        abi: routerAbi,
        functionName: "routeNativeDeposit",
        args: [testVault, ctx.account2.address, 100],
        value: parseEther("0.01"),
      }),
    );

    const [totalAssets, shares] = await Promise.all([
      ctx.publicClient.readContract({
        address: testVault,
        abi: vaultAbi,
        functionName: "totalAssets",
      }),
      ctx.publicClient.readContract({
        address: testVault,
        abi: vaultAbi,
        functionName: "sharesOf",
        args: [ctx.account2.address],
      }),
    ]);

    expect(totalAssets).toBe(parseEther("0.01"));
    expect(shares).toBe(parseEther("0.01"));

    await recordAction(ctx, deployment, {
      target: testRouter,
      value: parseEther("0.01"),
      decision: 0,
      reasonCode: 0,
      calldataHash: keccak256(routeCalldata),
      selector: routeSelector,
    });

    await expect(
      ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: testRouter,
        abi: routerAbi,
        functionName: "routeNativeDeposit",
        args: [testVault, ctx.account2.address, 1_001],
        value: parseEther("0.01"),
      }),
    ).rejects.toThrow();
  });
});

async function createContext() {
  const server = ganache.server({
    chain: { hardfork: "shanghai" },
    logging: { quiet: true },
    wallet: { deterministic: true, totalAccounts: 3 },
  });
  await server.listen(0);

  const addressInfo = server.address();
  if (typeof addressInfo === "string" || addressInfo === null) {
    throw new Error("Unexpected ganache address info.");
  }

  const rpcUrl = `http://127.0.0.1:${addressInfo.port}`;
  const chain = defineChain({
    id: 1337,
    name: "Interlock Test",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  const initialAccounts = Object.values((server.provider as any).getInitialAccounts()) as Array<{
    secretKey: Hex;
  }>;
  const account = privateKeyToAccount(initialAccounts[0].secretKey);
  const account2 = privateKeyToAccount(initialAccounts[1].secretKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const walletClient2 = createWalletClient({ account: account2, chain, transport: http(rpcUrl) });

  return {
    account,
    account2,
    chain,
    publicClient,
    walletClient,
    walletClient2,
    close: () => server.close(),
  };
}

async function deployCore(context: TestContext) {
  const agentRegistry = await deploy(context, "AgentRegistry");
  const policyRegistry = await deploy(context, "PolicyRegistry", [agentRegistry]);
  // attestor = account[0] (the test signer) so recordAction signatures verify.
  const actionAttestation = await deploy(context, "ActionAttestationV2", [
    agentRegistry,
    policyRegistry,
    context.account.address,
  ]);

  await wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: agentRegistry,
      abi: agentRegistryAbi,
      functionName: "setActionAttestation",
      args: [actionAttestation],
    }),
  );

  return { agentRegistry, policyRegistry, actionAttestation };
}

async function registerAgent(context: TestContext, agentRegistry: Address) {
  await wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: agentRegistry,
      abi: agentRegistryAbi,
      functionName: "registerAgent",
      args: ["ipfs://interlock-test-agent"],
    }),
  );
}

async function createPolicy(context: TestContext, deployment: Awaited<ReturnType<typeof deployCore>>) {
  await wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: deployment.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "createPolicy",
      args: [1n, parseEther("0.02"), 100, [deployment.agentRegistry], [toFunctionSelector("getAgent(uint256)")]],
    }),
  );
}

async function recordAction(
  context: TestContext,
  deployment: Awaited<ReturnType<typeof deployCore>>,
  input: { target?: Address; value: bigint; decision: number; reasonCode: number; calldataHash: Hex; selector: Hex },
) {
  const target = input.target ?? deployment.agentRegistry;
  const actionAttestationV2Abi = await abi("ActionAttestationV2");
  const nonce = (await context.publicClient.readContract({
    address: deployment.actionAttestation,
    abi: actionAttestationV2Abi,
    functionName: "nonces",
    args: [1n],
  })) as bigint;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const signature = await context.walletClient.signTypedData({
    account: context.account,
    domain: { name: "AgentOps", version: "2", chainId: context.chain.id, verifyingContract: deployment.actionAttestation },
    types: {
      Action: [
        { name: "agentId", type: "uint256" },
        { name: "policyId", type: "uint256" },
        { name: "target", type: "address" },
        { name: "value", type: "uint256" },
        { name: "calldataHash", type: "bytes32" },
        { name: "selector", type: "bytes4" },
        { name: "simulationHash", type: "bytes32" },
        { name: "decision", type: "uint8" },
        { name: "reasonCode", type: "uint8" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Action",
    message: {
      agentId: 1n,
      policyId: 1n,
      target,
      value: input.value,
      calldataHash: input.calldataHash,
      selector: input.selector,
      simulationHash: input.calldataHash,
      decision: input.decision,
      reasonCode: input.reasonCode,
      nonce,
      deadline,
    },
  });
  await wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: deployment.actionAttestation,
      abi: actionAttestationV2Abi,
      functionName: "recordAction",
      args: [
        1n,
        1n,
        target,
        input.value,
        input.calldataHash,
        input.selector,
        input.calldataHash,
        input.decision,
        input.reasonCode,
        deadline,
        signature,
      ],
    }),
  );
}

async function deploy(context: TestContext, name: string, args: readonly unknown[] = []) {
  const item = await artifact(name);
  const hash = await context.walletClient.deployContract({
    abi: item.abi,
    bytecode: item.bytecode,
    args,
  });
  const receipt = await wait(context, hash);
  return receipt.contractAddress!;
}

async function abi(name: string) {
  return (await artifact(name)).abi;
}

async function artifact(name: string) {
  return JSON.parse(
    await readFile(path.resolve(import.meta.dirname, "..", "artifacts", `${name}.json`), "utf8"),
  );
}

async function wait(context: TestContext, hash: Hex) {
  return context.publicClient.waitForTransactionReceipt({ hash });
}
