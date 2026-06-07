import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  http,
  maxUint256,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Ctx = Awaited<ReturnType<typeof createContext>>;
let ctx: Ctx;

beforeEach(async () => {
  ctx = await createContext();
});
afterEach(async () => {
  await ctx.close();
});

// ERC-20 selectors used as the policy selector allowlist.
const SEL_TRANSFER = "0xa9059cbb" as Hex;
const SEL_APPROVE = "0x095ea7b3" as Hex;

describe("TokenGuardedExecutor (on-chain ERC-20 token-rule enforcement)", () => {
  it("forwards an allowed transfer (recipient allowlisted, amount within cap)", async () => {
    const d = await deployGuard(ctx);
    const token = ctx.account2.address; // treat as the ERC-20 target (EOA call succeeds)
    await setup(ctx, d, token);
    await setTokenRule(ctx, d, token, { recipients: [ctx.account3.address], maxAmount: parseEther("100") });

    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [ctx.account3.address, parseEther("10")] });
    const [allowed, code] = await preview(ctx, d, token, data);
    expect(allowed).toBe(true);
    expect(code).toBe(0);
    // execute forwards (EOA call returns success)
    await execute(ctx, d, token, data);
  });

  it("blocks a transfer to a non-allowlisted recipient", async () => {
    const d = await deployGuard(ctx);
    const token = ctx.account2.address;
    await setup(ctx, d, token);
    await setTokenRule(ctx, d, token, { recipients: [ctx.account3.address], maxAmount: parseEther("100") });

    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [ctx.account.address, parseEther("10")] });
    const [allowed, code] = await preview(ctx, d, token, data);
    expect(allowed).toBe(false);
    expect(code).toBe(6); // TOKEN_RECIPIENT_NOT_ALLOWED
    await expect(execute(ctx, d, token, data)).rejects.toThrow();
  });

  it("blocks a transfer above the max amount", async () => {
    const d = await deployGuard(ctx);
    const token = ctx.account2.address;
    await setup(ctx, d, token);
    await setTokenRule(ctx, d, token, { recipients: [ctx.account3.address], maxAmount: parseEther("5") });

    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [ctx.account3.address, parseEther("10")] });
    const [, code] = await preview(ctx, d, token, data);
    expect(code).toBe(8); // TOKEN_AMOUNT_EXCEEDED
    await expect(execute(ctx, d, token, data)).rejects.toThrow();
  });

  it("blocks unlimited approve unless explicitly allowed", async () => {
    const d = await deployGuard(ctx);
    const token = ctx.account2.address;
    await setup(ctx, d, token, [SEL_APPROVE]);
    await setTokenRule(ctx, d, token, { spenders: [ctx.account3.address], allowUnlimitedApprove: false });

    const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ctx.account3.address, maxUint256] });
    const [, code] = await preview(ctx, d, token, data);
    expect(code).toBe(9); // UNLIMITED_APPROVE_BLOCKED
    await expect(execute(ctx, d, token, data)).rejects.toThrow();
  });

  it("blocks an approve to a non-allowlisted spender", async () => {
    const d = await deployGuard(ctx);
    const token = ctx.account2.address;
    await setup(ctx, d, token, [SEL_APPROVE]);
    await setTokenRule(ctx, d, token, { spenders: [ctx.account3.address] });

    const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ctx.account.address, parseEther("1")] });
    const [, code] = await preview(ctx, d, token, data);
    expect(code).toBe(7); // TOKEN_SPENDER_NOT_ALLOWED
    await expect(execute(ctx, d, token, data)).rejects.toThrow();
  });

  it("blocks a target that is not policy-allowlisted (policy layer still applies)", async () => {
    const d = await deployGuard(ctx);
    const token = ctx.account2.address;
    await setup(ctx, d, token);
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [ctx.account3.address, 1n] });
    const [, code] = await preview(ctx, d, ctx.account.address /* not allowlisted */, data);
    expect(code).toBe(1); // TARGET_NOT_ALLOWED
  });

  it("passes a token with no rule (advisory-free, policy governs)", async () => {
    const d = await deployGuard(ctx);
    const token = ctx.account2.address;
    await setup(ctx, d, token); // no token rule set
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [ctx.account3.address, parseEther("999")] });
    const [allowed, code] = await preview(ctx, d, token, data);
    expect(allowed).toBe(true);
    expect(code).toBe(0);
  });
});

/* ------------------------------------------------------------------ helpers */

type Deployment = { agentRegistry: Address; policyRegistry: Address; guard: Address };

async function deployGuard(context: Ctx): Promise<Deployment> {
  const agentRegistry = await deploy(context, "AgentRegistry");
  const policyRegistry = await deploy(context, "PolicyRegistry", [agentRegistry]);
  const guard = await deploy(context, "TokenGuardedExecutor", [policyRegistry]);
  return { agentRegistry, policyRegistry, guard };
}

async function setup(context: Ctx, d: Deployment, token: Address, selectors: Hex[] = [SEL_TRANSFER]) {
  await wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: d.agentRegistry,
      abi: await abi("AgentRegistry"),
      functionName: "registerAgent",
      args: ["ipfs://t"],
    }),
  );
  await wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: d.policyRegistry,
      abi: await abi("PolicyRegistry"),
      functionName: "createPolicy",
      args: [1n, parseEther("100"), 100, [token], selectors],
    }),
  );
}

async function setTokenRule(
  context: Ctx,
  d: Deployment,
  token: Address,
  rule: { recipients?: Address[]; spenders?: Address[]; maxAmount?: bigint; allowUnlimitedApprove?: boolean },
) {
  await wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: d.guard,
      abi: await abi("TokenGuardedExecutor"),
      functionName: "setTokenRule",
      args: [
        1n,
        token,
        {
          exists: true,
          allowUnlimitedApprove: rule.allowUnlimitedApprove ?? false,
          maxAmount: rule.maxAmount ?? 0n,
          allowedRecipients: rule.recipients ?? [],
          allowedSpenders: rule.spenders ?? [],
        },
      ],
    }),
  );
}

async function preview(context: Ctx, d: Deployment, target: Address, data: Hex): Promise<[boolean, number]> {
  const res = (await context.publicClient.readContract({
    address: d.guard,
    abi: await abi("TokenGuardedExecutor"),
    functionName: "previewExecute",
    args: [1n, 1n, target, 0n, data],
  })) as [boolean, number];
  return res;
}

async function execute(context: Ctx, d: Deployment, target: Address, data: Hex) {
  return wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: d.guard,
      abi: await abi("TokenGuardedExecutor"),
      functionName: "execute",
      args: [1n, 1n, target, 0n, data],
      value: 0n,
    }),
  );
}

async function deploy(context: Ctx, name: string, args: readonly unknown[] = []) {
  const item = await artifact(name);
  const hash = await context.walletClient.deployContract({ abi: item.abi, bytecode: item.bytecode, args });
  const receipt = await wait(context, hash);
  return receipt.contractAddress!;
}
async function abi(name: string) {
  return (await artifact(name)).abi;
}
async function artifact(name: string) {
  return JSON.parse(await readFile(path.resolve(import.meta.dirname, "..", "artifacts", `${name}.json`), "utf8"));
}
async function wait(context: Ctx, hash: Hex) {
  return context.publicClient.waitForTransactionReceipt({ hash });
}

async function createContext() {
  const server = ganache.server({ chain: { hardfork: "shanghai" }, logging: { quiet: true }, wallet: { deterministic: true, totalAccounts: 4 } });
  await server.listen(0);
  const addressInfo = server.address();
  if (typeof addressInfo === "string" || addressInfo === null) throw new Error("Unexpected ganache address info.");
  const rpcUrl = `http://127.0.0.1:${addressInfo.port}`;
  const chain = defineChain({ id: 1337, name: "Interlock Test", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialAccounts = Object.values((server.provider as any).getInitialAccounts()) as Array<{ secretKey: Hex }>;
  const account = privateKeyToAccount(initialAccounts[0].secretKey);
  const account2 = privateKeyToAccount(initialAccounts[1].secretKey);
  const account3 = privateKeyToAccount(initialAccounts[2].secretKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  return { account, account2, account3, chain, rpcUrl, publicClient, walletClient, provider: server.provider, close: () => server.close() };
}
