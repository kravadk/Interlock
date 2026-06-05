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
  parseEther,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentRegistryAbi, policyRegistryAbi } from "@interlock/shared";

/**
 * PolicyGuardedExecutor — on-chain enforcement. Verifies that allowed actions are forwarded (and
 * actually execute against a real target) while every disallowed action REVERTS before running.
 */

type TestContext = Awaited<ReturnType<typeof createContext>>;

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createContext();
});

afterEach(async () => {
  await ctx.close();
});

describe("PolicyGuardedExecutor", () => {
  it("forwards an allowed action and reverts every disallowed one", async () => {
    const d = await deployScenario();
    const guardAbi = await abi("PolicyGuardedExecutor");
    const vaultAbi = await abi("TestStrategyVault");
    const routerAbi = await abi("TestStrategyRouter");

    const routeData = encodeFunctionData({
      abi: routerAbi,
      functionName: "routeNativeDeposit",
      args: [d.testVault, ctx.account2.address, 100],
    });

    // ALLOW: policy owner routes an allowlisted deposit through the guard → forwarded + executed.
    await wait(
      await ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: d.guard,
        abi: guardAbi,
        functionName: "execute",
        args: [1n, 1n, d.testRouter, parseEther("0.01"), routeData],
        value: parseEther("0.01"),
      }),
    );
    const totalAssets = await ctx.publicClient.readContract({
      address: d.testVault,
      abi: vaultAbi,
      functionName: "totalAssets",
    });
    expect(totalAssets).toBe(parseEther("0.01")); // the call really ran through the guard

    const exec = (over: {
      target?: Address;
      value?: bigint;
      msgValue?: bigint;
      data?: Hex;
      account?: typeof ctx.account;
    }) =>
      (over.account ? ctx.walletClient2 : ctx.walletClient).writeContract({
        account: over.account ?? ctx.account,
        chain: ctx.chain,
        address: d.guard,
        abi: guardAbi,
        functionName: "execute",
        args: [1n, 1n, over.target ?? d.testRouter, over.value ?? parseEther("0.01"), over.data ?? routeData],
        value: over.msgValue ?? over.value ?? parseEther("0.01"),
      });

    // BLOCK: target not allowlisted.
    await expect(exec({ target: ctx.account2.address })).rejects.toThrow();
    // BLOCK: selector not allowlisted (unknown 4-byte selector to an allowed target).
    await expect(exec({ data: "0xdeadbeef" })).rejects.toThrow();
    // BLOCK: value above the policy limit.
    await expect(exec({ value: parseEther("0.25"), msgValue: parseEther("0.25") })).rejects.toThrow();
    // REVERT: msg.value != value.
    await expect(exec({ value: parseEther("0.01"), msgValue: parseEther("0.02") })).rejects.toThrow();
    // REVERT: caller is not the policy owner.
    await expect(exec({ account: ctx.account2 })).rejects.toThrow();
  });

  it("reverts when the policy is inactive", async () => {
    const d = await deployScenario();
    const guardAbi = await abi("PolicyGuardedExecutor");
    const routerAbi = await abi("TestStrategyRouter");
    const routeData = encodeFunctionData({
      abi: routerAbi,
      functionName: "routeNativeDeposit",
      args: [d.testVault, ctx.account2.address, 100],
    });

    await wait(
      await ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: d.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "updatePolicy",
        args: [1n, parseEther("0.02"), 100, false], // deactivate
      }),
    );

    await expect(
      ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: d.guard,
        abi: guardAbi,
        functionName: "execute",
        args: [1n, 1n, d.testRouter, parseEther("0.01"), routeData],
        value: parseEther("0.01"),
      }),
    ).rejects.toThrow();
  });

  it("previewExecute reports allowed/blocked without executing", async () => {
    const d = await deployScenario();
    const guardAbi = await abi("PolicyGuardedExecutor");
    const routerAbi = await abi("TestStrategyRouter");
    const routeData = encodeFunctionData({
      abi: routerAbi,
      functionName: "routeNativeDeposit",
      args: [d.testVault, ctx.account2.address, 100],
    });

    const allowed = (await ctx.publicClient.readContract({
      address: d.guard,
      abi: guardAbi,
      functionName: "previewExecute",
      args: [1n, 1n, d.testRouter, parseEther("0.01"), routeData],
    })) as [boolean, number];
    expect(allowed[0]).toBe(true);
    expect(allowed[1]).toBe(0); // POLICY_PASSED

    const overspend = (await ctx.publicClient.readContract({
      address: d.guard,
      abi: guardAbi,
      functionName: "previewExecute",
      args: [1n, 1n, d.testRouter, parseEther("1"), routeData],
    })) as [boolean, number];
    expect(overspend[0]).toBe(false);
    expect(overspend[1]).toBe(2); // VALUE_LIMIT_EXCEEDED
  });
});

/* ---------------------------------------------------------------- harness ---- */

async function deployScenario() {
  const agentRegistry = await deploy("AgentRegistry");
  const policyRegistry = await deploy("PolicyRegistry", [agentRegistry]);
  const guard = await deploy("PolicyGuardedExecutor", [policyRegistry]);
  const testVault = await deploy("TestStrategyVault");
  const testRouter = await deploy("TestStrategyRouter");

  await wait(
    await ctx.walletClient.writeContract({
      account: ctx.account,
      chain: ctx.chain,
      address: agentRegistry,
      abi: agentRegistryAbi,
      functionName: "registerAgent",
      args: ["ipfs://interlock-test-agent"],
    }),
  );
  await wait(
    await ctx.walletClient.writeContract({
      account: ctx.account,
      chain: ctx.chain,
      address: policyRegistry,
      abi: policyRegistryAbi,
      functionName: "createPolicy",
      args: [
        1n,
        parseEther("0.02"),
        100,
        [testRouter],
        [toFunctionSelector("routeNativeDeposit(address,address,uint16)")],
      ],
    }),
  );

  return { agentRegistry, policyRegistry, guard, testVault, testRouter };
}

async function createContext() {
  const server = ganache.server({
    chain: { hardfork: "shanghai" },
    logging: { quiet: true },
    wallet: { deterministic: true, totalAccounts: 3 },
  });
  await server.listen(0);
  const addressInfo = server.address();
  if (typeof addressInfo === "string" || addressInfo === null) throw new Error("Unexpected ganache address info.");
  const rpcUrl = `http://127.0.0.1:${addressInfo.port}`;
  const chain = defineChain({
    id: 1337,
    name: "Interlock Test",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const initialAccounts = Object.values((server.provider as any).getInitialAccounts()) as Array<{ secretKey: Hex }>;
  const account = privateKeyToAccount(initialAccounts[0].secretKey);
  const account2 = privateKeyToAccount(initialAccounts[1].secretKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const walletClient2 = createWalletClient({ account: account2, chain, transport: http(rpcUrl) });
  return { account, account2, chain, publicClient, walletClient, walletClient2, close: () => server.close() };
}

async function deploy(name: string, args: readonly unknown[] = []) {
  const item = await artifact(name);
  const hash = await ctx.walletClient.deployContract({ abi: item.abi, bytecode: item.bytecode, args });
  const receipt = await wait(hash);
  return receipt.contractAddress!;
}

async function abi(name: string) {
  return (await artifact(name)).abi;
}

async function artifact(name: string) {
  return JSON.parse(await readFile(path.resolve(import.meta.dirname, "..", "artifacts", `${name}.json`), "utf8"));
}

async function wait(hash: Hex) {
  return ctx.publicClient.waitForTransactionReceipt({ hash });
}
