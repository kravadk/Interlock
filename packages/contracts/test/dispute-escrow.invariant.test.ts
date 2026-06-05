import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ganache from "ganache";
import { createPublicClient, createWalletClient, defineChain, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type TestContext = Awaited<ReturnType<typeof createContext>>;
let ctx: TestContext;

beforeEach(async () => {
  ctx = await createContext();
});

afterEach(async () => {
  await ctx.close();
});

describe("DisputeEscrow invariants", () => {
  it("conserves bonded value through resolve and withdraw", async () => {
    const escrow = await deployEscrow();
    const abi = await artifactAbi("DisputeEscrow");
    let actionCheckId = 1n;

    await fc.assert(
      fc.asyncProperty(
        fc.bigInt({ min: 1n, max: 1_000_000_000_000_000n }),
        fc.boolean(),
        async (bond, challengerWins) => {
          const id = actionCheckId++;
          const winner = challengerWins ? ctx.account2.address : ctx.account.address;

          await send(escrow, abi, "bondRecord", [id], ctx.account, bond);
          await send(escrow, abi, "openDispute", [id], ctx.account2, bond);
          await send(escrow, abi, "resolve", [id, challengerWins], ctx.account);

          expect(await read(escrow, abi, "withdrawable", [winner])).toBe(bond * 2n);
          expect(await ctx.publicClient.getBalance({ address: escrow })).toBe(bond * 2n);

          await send(escrow, abi, "withdraw", [], challengerWins ? ctx.account2 : ctx.account);

          expect(await read(escrow, abi, "withdrawable", [winner])).toBe(0n);
          expect(await ctx.publicClient.getBalance({ address: escrow })).toBe(0n);
        },
      ),
      { numRuns: 8 },
    );
  }, 20_000);

  it("never pays more than the recorder bond when reclaimed after an undisputed window", async () => {
    const escrow = await deployEscrow();
    const abi = await artifactAbi("DisputeEscrow");
    let actionCheckId = 1_000n;

    await fc.assert(
      fc.asyncProperty(fc.bigInt({ min: 1n, max: 1_000_000_000_000_000n }), async (bond) => {
        const id = actionCheckId++;
        await send(escrow, abi, "bondRecord", [id], ctx.account, bond);
        await ctx.advanceTime(7201);
        await send(escrow, abi, "reclaimRecordBond", [id], ctx.account);

        expect(await read(escrow, abi, "withdrawable", [ctx.account.address])).toBe(bond);
        await send(escrow, abi, "withdraw", [], ctx.account);
        expect(await read(escrow, abi, "withdrawable", [ctx.account.address])).toBe(0n);
        expect(await ctx.publicClient.getBalance({ address: escrow })).toBe(0n);
      }),
      { numRuns: 8 },
    );
  }, 20_000);
});

async function deployEscrow() {
  const item = await artifact("DisputeEscrow");
  const hash = await ctx.walletClient.deployContract({
    abi: item.abi,
    bytecode: item.bytecode,
    args: [ctx.account.address],
  });
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress!;
}

async function send(address: `0x${string}`, abi: any[], functionName: string, args: any[], account: any, value?: bigint) {
  const client = account.address === ctx.account.address ? ctx.walletClient : ctx.walletClient2;
  const hash = await client.writeContract({ account, chain: ctx.chain, address, abi, functionName, args, value });
  return ctx.publicClient.waitForTransactionReceipt({ hash });
}

async function read(address: `0x${string}`, abi: any[], functionName: string, args: any[]) {
  return ctx.publicClient.readContract({ address, abi, functionName, args }) as Promise<any>;
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
  const initial = Object.values((server.provider as any).getInitialAccounts()) as Array<{ secretKey: Hex }>;
  const account = privateKeyToAccount(initial[0].secretKey);
  const account2 = privateKeyToAccount(initial[1].secretKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const walletClient2 = createWalletClient({ account: account2, chain, transport: http(rpcUrl) });
  const advanceTime = async (seconds: number) => {
    await (server.provider as any).request({ method: "evm_increaseTime", params: [seconds] });
    await (server.provider as any).request({ method: "evm_mine", params: [] });
  };
  return { account, account2, chain, publicClient, walletClient, walletClient2, advanceTime, close: () => server.close() };
}

async function artifactAbi(name: string) {
  return (await artifact(name)).abi as any[];
}

async function artifact(name: string) {
  return JSON.parse(await readFile(path.resolve(import.meta.dirname, "..", "artifacts", `${name}.json`), "utf8"));
}
