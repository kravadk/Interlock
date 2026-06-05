import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ganache from "ganache";
import { createPublicClient, createWalletClient, defineChain, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * DisputeEscrow — two-sided bonds, arbiter resolves, winner takes both bonds (slashing). Verifies
 * the full economic flow (bond → dispute → resolve → withdraw), reclaim-after-window, and guards.
 */

type TestContext = Awaited<ReturnType<typeof createContext>>;
let ctx: TestContext;

beforeEach(async () => {
  ctx = await createContext();
});
afterEach(async () => {
  await ctx.close();
});

describe("DisputeEscrow", () => {
  it("pays the challenger both bonds when the arbiter rules for them", async () => {
    const escrow = await deployEscrow();
    const abi = await artifactAbi("DisputeEscrow");

    await send(escrow, abi, "bondRecord", [1n], ctx.account, parseEther("0.01")); // recorder
    await send(escrow, abi, "openDispute", [1n], ctx.account2, parseEther("0.01")); // challenger
    await send(escrow, abi, "resolve", [1n, true], ctx.account); // arbiter → challenger wins

    const dispute = await read(escrow, abi, "getDispute", [1n]);
    expect(dispute.status).toBe(3); // RESOLVED
    const credited = await read(escrow, abi, "withdrawable", [ctx.account2.address]);
    expect(credited).toBe(parseEther("0.02"));

    const before = await ctx.publicClient.getBalance({ address: ctx.account2.address });
    await send(escrow, abi, "withdraw", [], ctx.account2);
    const after = await ctx.publicClient.getBalance({ address: ctx.account2.address });
    expect(after > before).toBe(true); // received ~0.02 minus gas
    expect(await read(escrow, abi, "withdrawable", [ctx.account2.address])).toBe(0n);
  });

  it("pays the recorder both bonds when the arbiter rules against the challenger", async () => {
    const escrow = await deployEscrow();
    const abi = await artifactAbi("DisputeEscrow");
    await send(escrow, abi, "bondRecord", [2n], ctx.account, parseEther("0.01"));
    await send(escrow, abi, "openDispute", [2n], ctx.account2, parseEther("0.01"));
    await send(escrow, abi, "resolve", [2n, false], ctx.account); // recorder wins
    expect(await read(escrow, abi, "withdrawable", [ctx.account.address])).toBe(parseEther("0.02"));
  });

  it("enforces the guards", async () => {
    const escrow = await deployEscrow();
    const abi = await artifactAbi("DisputeEscrow");

    // dispute without a bond
    await expect(send(escrow, abi, "openDispute", [99n], ctx.account2, parseEther("0.01"))).rejects.toThrow();
    // self-dispute
    await send(escrow, abi, "bondRecord", [3n], ctx.account, parseEther("0.01"));
    await expect(send(escrow, abi, "openDispute", [3n], ctx.account, parseEther("0.01"))).rejects.toThrow();
    // insufficient challenger bond
    await send(escrow, abi, "bondRecord", [4n], ctx.account, parseEther("0.02"));
    await expect(send(escrow, abi, "openDispute", [4n], ctx.account2, parseEther("0.01"))).rejects.toThrow();
    // only arbiter resolves
    await send(escrow, abi, "bondRecord", [5n], ctx.account, parseEther("0.01"));
    await send(escrow, abi, "openDispute", [5n], ctx.account2, parseEther("0.01"));
    await expect(send(escrow, abi, "resolve", [5n, true], ctx.account2)).rejects.toThrow();
    // withdraw nothing
    await expect(send(escrow, abi, "withdraw", [], ctx.account3)).rejects.toThrow();
  });

  it("lets the recorder reclaim the bond after the window with no dispute", async () => {
    const escrow = await deployEscrow();
    const abi = await artifactAbi("DisputeEscrow");
    await send(escrow, abi, "bondRecord", [6n], ctx.account, parseEther("0.01"));
    await expect(send(escrow, abi, "reclaimRecordBond", [6n], ctx.account)).rejects.toThrow(); // window open
    await ctx.advanceTime(7201);
    await send(escrow, abi, "reclaimRecordBond", [6n], ctx.account);
    expect(await read(escrow, abi, "withdrawable", [ctx.account.address])).toBe(parseEther("0.01"));
  });
});

/* ---------------------------------------------------------------- harness ---- */

async function deployEscrow() {
  const item = await artifact("DisputeEscrow");
  const hash = await ctx.walletClient.deployContract({ abi: item.abi, bytecode: item.bytecode, args: [ctx.account.address] });
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress!;
}

async function send(address: `0x${string}`, abi: any[], functionName: string, args: any[], account: any, value?: bigint) {
  const client =
    account.address === ctx.account.address
      ? ctx.walletClient
      : account.address === ctx.account2.address
        ? ctx.walletClient2
        : ctx.walletClient3;
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
  const initial = Object.values((server.provider as any).getInitialAccounts()) as Array<{ secretKey: Hex }>;
  const account = privateKeyToAccount(initial[0].secretKey);
  const account2 = privateKeyToAccount(initial[1].secretKey);
  const account3 = privateKeyToAccount(initial[2].secretKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const walletClient2 = createWalletClient({ account: account2, chain, transport: http(rpcUrl) });
  const walletClient3 = createWalletClient({ account: account3, chain, transport: http(rpcUrl) });
  const advanceTime = async (seconds: number) => {
    await (server.provider as any).request({ method: "evm_increaseTime", params: [seconds] });
    await (server.provider as any).request({ method: "evm_mine", params: [] });
  };
  return {
    account,
    account2,
    account3,
    chain,
    publicClient,
    walletClient,
    walletClient2,
    walletClient3,
    advanceTime,
    close: () => server.close(),
  };
}

async function artifactAbi(name: string) {
  return (await artifact(name)).abi as any[];
}

async function artifact(name: string) {
  return JSON.parse(await readFile(path.resolve(import.meta.dirname, "..", "artifacts", `${name}.json`), "utf8"));
}
