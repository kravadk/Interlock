import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseEther,
  toFunctionSelector,
  type Account,
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

const SELECTOR = toFunctionSelector("getAgent(uint256)");
const CALLDATA_HASH = keccak256("0x1234");
const EVIDENCE_HASH = keccak256("0x5678");

describe("ActionAttestationV4 (committee-verified recording)", () => {
  it("records an ALLOW signed by a 1-of-1 committee (status ACTIVE, evidenceHash)", async () => {
    const d = await deployV4(ctx, [ctx.account], 1n);
    await setup(ctx, d);
    await recordSigned(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01") }, [ctx.account]);
    const check = await readCheck(ctx, d, 1n);
    expect(check.decision).toBe(0);
    expect(check.status).toBe(0);
    expect(check.evidenceHash).toBe(EVIDENCE_HASH);
  });

  it("records with 2 of a 3-member committee (>= threshold)", async () => {
    const d = await deployV4(ctx, [ctx.account, ctx.account2, ctx.account3], 2n);
    await setup(ctx, d);
    await recordSigned(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01") }, [ctx.account, ctx.account2]);
    expect((await readCheck(ctx, d, 1n)).status).toBe(0);
  });

  it("rejects when fewer than threshold members sign (1 of 2-of-3)", async () => {
    const d = await deployV4(ctx, [ctx.account, ctx.account2, ctx.account3], 2n);
    await setup(ctx, d);
    await expect(
      recordSigned(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01") }, [ctx.account]),
    ).rejects.toThrow();
  });

  it("rejects a duplicate signer counted once (two sigs from the same member, threshold 2)", async () => {
    const d = await deployV4(ctx, [ctx.account, ctx.account2, ctx.account3], 2n);
    await setup(ctx, d);
    await expect(
      recordSigned(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01") }, [ctx.account, ctx.account]),
    ).rejects.toThrow();
  });

  it("rejects a non-member signature (1-of-1 committee signed by a non-member)", async () => {
    const d = await deployV4(ctx, [ctx.account], 1n);
    await setup(ctx, d);
    await expect(
      recordSigned(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01") }, [ctx.account2]),
    ).rejects.toThrow();
  });

  it("rejects an expired deadline", async () => {
    const d = await deployV4(ctx, [ctx.account], 1n);
    await setup(ctx, d);
    await expect(
      recordSigned(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01"), deadline: 1n }, [ctx.account]),
    ).rejects.toThrow();
  });

  it("updates AgentRegistry reputation on record", async () => {
    const d = await deployV4(ctx, [ctx.account], 1n);
    await setup(ctx, d);
    await recordSigned(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01") }, [ctx.account]);
    const agent = (await ctx.publicClient.readContract({
      address: d.agentRegistry,
      abi: await abi("AgentRegistry"),
      functionName: "getAgent",
      args: [1n],
    })) as { allowedActions: bigint };
    expect(agent.allowedActions).toBe(1n);
  });

  it("lets a committee member challenge within the window", async () => {
    const d = await deployV4(ctx, [ctx.account, ctx.account2], 1n);
    await setup(ctx, d);
    await recordSigned(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01") }, [ctx.account]);
    // account2 is a committee member (not agent/policy owner) — may challenge.
    const wallet2 = createWalletClient({ account: ctx.account2, chain: ctx.chain, transport: http(ctx.rpcUrl) });
    await wait(
      ctx,
      await wallet2.writeContract({
        account: ctx.account2,
        chain: ctx.chain,
        address: d.actionAttestation,
        abi: await abi("ActionAttestationV4"),
        functionName: "challenge",
        args: [1n, "looks wrong"],
      }),
    );
    expect((await readCheck(ctx, d, 1n)).status).toBe(1); // CHALLENGED
  });
});

/* ------------------------------------------------------------------ helpers */

type Deployment = { agentRegistry: Address; policyRegistry: Address; committee: Address; actionAttestation: Address };

async function deployV4(context: Ctx, members: Account[], threshold: bigint): Promise<Deployment> {
  const agentRegistry = await deploy(context, "AgentRegistry");
  const policyRegistry = await deploy(context, "PolicyRegistry", [agentRegistry]);
  const committee = await deploy(context, "AttestorCommittee", [members.map((m) => m.address), threshold]);
  const actionAttestation = await deploy(context, "ActionAttestationV4", [agentRegistry, policyRegistry, committee]);
  await wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: agentRegistry,
      abi: await abi("AgentRegistry"),
      functionName: "setActionAttestation",
      args: [actionAttestation],
    }),
  );
  return { agentRegistry, policyRegistry, committee, actionAttestation };
}

async function setup(context: Ctx, d: Deployment) {
  await wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: d.agentRegistry,
      abi: await abi("AgentRegistry"),
      functionName: "registerAgent",
      args: ["ipfs://interlock-test-agent"],
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
      args: [1n, parseEther("0.02"), 100, [d.agentRegistry], [SELECTOR]],
    }),
  );
}

type RecordInput = { decision: number; reasonCode: number; value: bigint; deadline?: bigint };

async function signFor(context: Ctx, d: Deployment, input: RecordInput, signer: Account, nonce: bigint, deadline: bigint) {
  const wallet = createWalletClient({ account: signer, chain: context.chain, transport: http(context.rpcUrl) });
  return wallet.signTypedData({
    account: signer,
    domain: { name: "AgentOps", version: "4", chainId: context.chain.id, verifyingContract: d.actionAttestation },
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
      agentId: 1n,
      policyId: 1n,
      target: d.agentRegistry,
      value: input.value,
      calldataHash: CALLDATA_HASH,
      selector: SELECTOR,
      simulationHash: CALLDATA_HASH,
      evidenceHash: EVIDENCE_HASH,
      decision: input.decision,
      reasonCode: input.reasonCode,
      nonce,
      deadline,
    },
  });
}

async function recordSigned(context: Ctx, d: Deployment, input: RecordInput, signers: Account[]) {
  const nonce = (await context.publicClient.readContract({
    address: d.actionAttestation,
    abi: await abi("ActionAttestationV4"),
    functionName: "nonces",
    args: [1n],
  })) as bigint;
  const deadline = input.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 3600);
  const signatures: Hex[] = [];
  for (const s of signers) signatures.push(await signFor(context, d, input, s, nonce, deadline));
  return wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: d.actionAttestation,
      abi: await abi("ActionAttestationV4"),
      functionName: "recordAction",
      args: [
        1n,
        1n,
        d.agentRegistry,
        input.value,
        CALLDATA_HASH,
        SELECTOR,
        CALLDATA_HASH,
        EVIDENCE_HASH,
        input.decision,
        input.reasonCode,
        deadline,
        signatures,
      ],
    }),
  );
}

async function readCheck(context: Ctx, d: Deployment, id: bigint) {
  return (await context.publicClient.readContract({
    address: d.actionAttestation,
    abi: await abi("ActionAttestationV4"),
    functionName: "getActionCheck",
    args: [id],
  })) as { decision: number; reasonCode: number; status: number; evidenceHash: Hex };
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
  const server = ganache.server({
    chain: { hardfork: "shanghai" },
    logging: { quiet: true },
    wallet: { deterministic: true, totalAccounts: 4 },
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialAccounts = Object.values((server.provider as any).getInitialAccounts()) as Array<{ secretKey: Hex }>;
  const account = privateKeyToAccount(initialAccounts[0].secretKey);
  const account2 = privateKeyToAccount(initialAccounts[1].secretKey);
  const account3 = privateKeyToAccount(initialAccounts[2].secretKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  return { account, account2, account3, chain, rpcUrl, publicClient, walletClient, provider: server.provider, close: () => server.close() };
}
