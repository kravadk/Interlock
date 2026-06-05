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

describe("ActionAttestationV3", () => {
  it("records an attestor-signed ALLOW carrying evidenceHash, status ACTIVE", async () => {
    const d = await deployV3(ctx);
    await registerAgent(ctx, d.agentRegistry);
    await createPolicy(ctx, d);

    await recordSigned(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01") });

    const check = await readCheck(ctx, d, 1n);
    expect(check.decision).toBe(0);
    expect(check.status).toBe(0); // ACTIVE
    expect(check.evidenceHash).toBe(EVIDENCE_HASH);
  });

  it("records a V3-only reason code (RWA_OVEREXPOSURE = 6) as a BLOCK", async () => {
    const d = await deployV3(ctx);
    await registerAgent(ctx, d.agentRegistry);
    await createPolicy(ctx, d);

    await recordSigned(ctx, d, { decision: 1, reasonCode: 6, value: parseEther("0.5") });

    const check = await readCheck(ctx, d, 1n);
    expect(check.decision).toBe(1); // BLOCK
    expect(check.reasonCode).toBe(6); // RWA_OVEREXPOSURE
  });

  it("rejects a forged signature (signed by a non-attestor)", async () => {
    const d = await deployV3(ctx);
    await registerAgent(ctx, d.agentRegistry);
    await createPolicy(ctx, d);

    await expect(
      recordSigned(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01"), signer: ctx.account2 }),
    ).rejects.toThrow();
  });

  it("rejects a tampered evidenceHash (not the one that was signed)", async () => {
    const d = await deployV3(ctx);
    await registerAgent(ctx, d.agentRegistry);
    await createPolicy(ctx, d);

    const { signature, deadline } = await buildSignature(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01") });
    await expect(
      sendRecord(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01") }, deadline, signature, keccak256("0x9999")),
    ).rejects.toThrow();
  });

  it("finalizes after the dispute window", async () => {
    const d = await deployV3(ctx);
    await registerAgent(ctx, d.agentRegistry);
    await createPolicy(ctx, d);
    await recordSigned(ctx, d, { decision: 0, reasonCode: 0, value: parseEther("0.01") });

    await ctx.provider.request({ method: "evm_increaseTime", params: [2 * 60 * 60 + 1] });
    await ctx.provider.request({ method: "evm_mine", params: [] });
    await wait(
      ctx,
      await ctx.walletClient.writeContract({
        account: ctx.account,
        chain: ctx.chain,
        address: d.actionAttestation,
        abi: await abi("ActionAttestationV3"),
        functionName: "finalize",
        args: [1n],
      }),
    );
    const check = await readCheck(ctx, d, 1n);
    expect(check.status).toBe(2); // FINALIZED
  });
});

/* ------------------------------------------------------------------ helpers */

type Deployment = { agentRegistry: Address; policyRegistry: Address; actionAttestation: Address };

async function deployV3(context: Ctx): Promise<Deployment> {
  const agentRegistry = await deploy(context, "AgentRegistry");
  const policyRegistry = await deploy(context, "PolicyRegistry", [agentRegistry]);
  const actionAttestation = await deploy(context, "ActionAttestationV3", [
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
      abi: await abi("AgentRegistry"),
      functionName: "setActionAttestation",
      args: [actionAttestation],
    }),
  );
  return { agentRegistry, policyRegistry, actionAttestation };
}

async function registerAgent(context: Ctx, agentRegistry: Address) {
  await wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: agentRegistry,
      abi: await abi("AgentRegistry"),
      functionName: "registerAgent",
      args: ["ipfs://interlock-test-agent"],
    }),
  );
}

async function createPolicy(context: Ctx, d: Deployment) {
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

type RecordInput = {
  decision: number;
  reasonCode: number;
  value: bigint;
  signer?: Account;
  nonce?: bigint;
  deadline?: bigint;
};

async function buildSignature(context: Ctx, d: Deployment, input: RecordInput) {
  const signer = input.signer ?? context.account;
  const nonce =
    input.nonce ??
    ((await context.publicClient.readContract({
      address: d.actionAttestation,
      abi: await abi("ActionAttestationV3"),
      functionName: "nonces",
      args: [1n],
    })) as bigint);
  const deadline = input.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 3600);

  const signature = await context.walletClient.signTypedData({
    account: signer,
    domain: {
      name: "AgentOps",
      version: "3",
      chainId: context.chain.id,
      verifyingContract: d.actionAttestation,
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
  return { signature, deadline };
}

async function sendRecord(context: Ctx, d: Deployment, input: RecordInput, deadline: bigint, signature: Hex, evidenceHash: Hex = EVIDENCE_HASH) {
  return wait(
    context,
    await context.walletClient.writeContract({
      account: context.account,
      chain: context.chain,
      address: d.actionAttestation,
      abi: await abi("ActionAttestationV3"),
      functionName: "recordAction",
      args: [
        1n,
        1n,
        d.agentRegistry,
        input.value,
        CALLDATA_HASH,
        SELECTOR,
        CALLDATA_HASH,
        evidenceHash,
        input.decision,
        input.reasonCode,
        deadline,
        signature,
      ],
    }),
  );
}

async function recordSigned(context: Ctx, d: Deployment, input: RecordInput) {
  const { signature, deadline } = await buildSignature(context, d, input);
  return sendRecord(context, d, input, deadline, signature);
}

async function readCheck(context: Ctx, d: Deployment, id: bigint) {
  return (await context.publicClient.readContract({
    address: d.actionAttestation,
    abi: await abi("ActionAttestationV3"),
    functionName: "getActionCheck",
    args: [id],
  })) as {
    decision: number;
    reasonCode: number;
    status: number;
    timestamp: bigint;
    finalizableAt: bigint;
    evidenceHash: Hex;
  };
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
  const initialAccounts = Object.values((server.provider as any).getInitialAccounts()) as Array<{ secretKey: Hex }>;
  const account = privateKeyToAccount(initialAccounts[0].secretKey);
  const account2 = privateKeyToAccount(initialAccounts[1].secretKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  return {
    account,
    account2,
    chain,
    publicClient,
    walletClient,
    provider: server.provider,
    close: () => server.close(),
  };
}
