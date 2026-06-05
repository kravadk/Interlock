import fc from "fast-check";
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

type TestContext = Awaited<ReturnType<typeof createContext>>;
let ctx: TestContext;

beforeEach(async () => {
  ctx = await createContext();
});

afterEach(async () => {
  await ctx.close();
});

describe("PolicyGuardedExecutor invariants", () => {
  it("previewExecute allows exactly target + selector + value passing policy checks", async () => {
    const d = await deployScenario();
    const guardAbi = await abi("PolicyGuardedExecutor");
    const routerAbi = await abi("TestStrategyRouter");
    const allowedData = encodeFunctionData({
      abi: routerAbi,
      functionName: "routeNativeDeposit",
      args: [d.testVault, ctx.account2.address, 100],
    });

    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.constantFrom<"allowed" | "blocked" | "empty">("allowed", "blocked", "empty"),
        fc.boolean(),
        async (targetAllowed, selectorMode, valueAllowed) => {
          const target = targetAllowed ? d.testRouter : ctx.account2.address;
          const data = selectorMode === "allowed" ? allowedData : selectorMode === "blocked" ? "0xdeadbeef" : "0x";
          const value = valueAllowed ? parseEther("0.01") : parseEther("0.03");
          const [allowed, reason] = (await ctx.publicClient.readContract({
            address: d.guard,
            abi: guardAbi,
            functionName: "previewExecute",
            args: [1n, 1n, target, value, data],
          })) as [boolean, number];

          const selectorPasses = selectorMode !== "blocked";
          const expected = targetAllowed && selectorPasses && valueAllowed;
          expect(allowed).toBe(expected);
          if (expected) {
            expect(reason).toBe(0);
          }
        },
      ),
      { numRuns: 16 },
    );
  });
});

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
    wallet: { deterministic: true, totalAccounts: 2 },
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
  return { account, account2, chain, publicClient, walletClient, close: () => server.close() };
}

async function deploy(name: string, args: readonly unknown[] = []) {
  const item = await artifact(name);
  const hash = await ctx.walletClient.deployContract({ abi: item.abi, bytecode: item.bytecode, args });
  const receipt = await wait(hash);
  return receipt.contractAddress! as Address;
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
