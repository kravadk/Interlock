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
  toHex,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { agentRegistryAbi, policyRegistryAbi } from "@interlock/shared";

/** Phase 11 — AttestorCommittee (m-of-n signatures) + ReputationOracle (score/tier from counters). */

type TestContext = Awaited<ReturnType<typeof createContext>>;
let ctx: TestContext;

beforeEach(async () => {
  ctx = await createContext();
});
afterEach(async () => {
  await ctx.close();
});

describe("AttestorCommittee", () => {
  it("approves only when >= threshold distinct members sign", async () => {
    const abi = await artifactAbi("AttestorCommittee");
    const committee = await deploy("AttestorCommittee", [
      [ctx.account.address, ctx.account2.address, ctx.account3.address],
      2n,
    ]);

    const digest = keccak256(toHex("interlock-committee-test"));
    const sig1 = await ctx.account.sign!({ hash: digest });
    const sig2 = await ctx.account2.sign!({ hash: digest });
    const outsider = privateKeyToAccount(generatePrivateKey());
    const sigOut = await outsider.sign!({ hash: digest });

    const approved = (args: Hex[]) =>
      ctx.publicClient.readContract({ address: committee, abi, functionName: "isApproved", args: [digest, args] });

    expect(await approved([sig1, sig2])).toBe(true); // 2 distinct members
    expect(await approved([sig1])).toBe(false); // below threshold
    expect(await approved([sig1, sig1])).toBe(false); // duplicate → only 1 distinct
    expect(await approved([sigOut, sigOut])).toBe(false); // non-member
    expect(await approved([sig1, sigOut])).toBe(false); // 1 valid + 1 non-member
  });

  it("guards admin to the owner", async () => {
    const abi = await artifactAbi("AttestorCommittee");
    const committee = await deploy("AttestorCommittee", [[ctx.account.address, ctx.account2.address], 1n]);

    // owner can raise the threshold
    await wait(
      await ctx.walletClient.writeContract({ account: ctx.account, chain: ctx.chain, address: committee, abi, functionName: "setThreshold", args: [2n] }),
    );
    expect(await ctx.publicClient.readContract({ address: committee, abi, functionName: "threshold" })).toBe(2n);
    // non-owner cannot
    await expect(
      ctx.walletClient2.writeContract({ account: ctx.account2, chain: ctx.chain, address: committee, abi, functionName: "setThreshold", args: [1n] }),
    ).rejects.toThrow();
  });
});

describe("ReputationOracle", () => {
  it("scores an agent from its on-chain counters", async () => {
    const d = await deployCore();
    await registerAgent(d.agentRegistry);
    await createPolicy(d);
    const oracleAbi = await artifactAbi("ReputationOracle");
    const oracle = await deploy("ReputationOracle", [d.agentRegistry]);

    // unproven agent (#1, no actions yet) → 5000 / UNPROVEN
    let score = (await ctx.publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: "getScore", args: [1n] })) as [bigint, number];
    expect(score).toEqual([5000n, 0]);

    // record 1 ALLOW + 1 BLOCK → allowed 1 / total 2 → 5000 bps, NASCENT (total < 3)
    await recordAction(d, { value: 0n, decision: 0, reasonCode: 0, calldataHash: keccak256("0x1234"), selector: toFunctionSelector("getAgent(uint256)") });
    await recordAction(d, { target: ctx.account2.address, value: parseEther("0.25"), decision: 1, reasonCode: 1, calldataHash: keccak256("0x1234"), selector: toFunctionSelector("ownerOf(uint256)") });

    score = (await ctx.publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: "getScore", args: [1n] })) as [bigint, number];
    expect(score[0]).toBe(5000n);
    expect(score[1]).toBe(1); // NASCENT

    expect(await ctx.publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: "meetsThreshold", args: [1n, 5000n] })).toBe(true);
    expect(await ctx.publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: "meetsThreshold", args: [1n, 6000n] })).toBe(false);
  });
});

/* ---------------------------------------------------------------- harness ---- */

async function deployCore() {
  const agentRegistry = await deploy("AgentRegistry");
  const policyRegistry = await deploy("PolicyRegistry", [agentRegistry]);
  const actionAttestation = await deploy("ActionAttestationV2", [agentRegistry, policyRegistry, ctx.account.address]);
  await wait(
    await ctx.walletClient.writeContract({ account: ctx.account, chain: ctx.chain, address: agentRegistry, abi: agentRegistryAbi, functionName: "setActionAttestation", args: [actionAttestation] }),
  );
  return { agentRegistry, policyRegistry, actionAttestation };
}

async function registerAgent(agentRegistry: Address) {
  await wait(
    await ctx.walletClient.writeContract({ account: ctx.account, chain: ctx.chain, address: agentRegistry, abi: agentRegistryAbi, functionName: "registerAgent", args: ["ipfs://interlock-test-agent"] }),
  );
}

async function createPolicy(d: Awaited<ReturnType<typeof deployCore>>) {
  await wait(
    await ctx.walletClient.writeContract({ account: ctx.account, chain: ctx.chain, address: d.policyRegistry, abi: policyRegistryAbi, functionName: "createPolicy", args: [1n, parseEther("0.02"), 100, [d.agentRegistry], [toFunctionSelector("getAgent(uint256)")]] }),
  );
}

async function recordAction(d: Awaited<ReturnType<typeof deployCore>>, input: { target?: Address; value: bigint; decision: number; reasonCode: number; calldataHash: Hex; selector: Hex }) {
  const target = input.target ?? d.agentRegistry;
  const actionAttestationV2Abi = await artifactAbi("ActionAttestationV2");
  const nonce = (await ctx.publicClient.readContract({ address: d.actionAttestation, abi: actionAttestationV2Abi, functionName: "nonces", args: [1n] })) as bigint;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const signature = await ctx.walletClient.signTypedData({
    account: ctx.account,
    domain: { name: "AgentOps", version: "2", chainId: ctx.chain.id, verifyingContract: d.actionAttestation },
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
    message: { agentId: 1n, policyId: 1n, target, value: input.value, calldataHash: input.calldataHash, selector: input.selector, simulationHash: input.calldataHash, decision: input.decision, reasonCode: input.reasonCode, nonce, deadline },
  });
  await wait(
    await ctx.walletClient.writeContract({ account: ctx.account, chain: ctx.chain, address: d.actionAttestation, abi: actionAttestationV2Abi, functionName: "recordAction", args: [1n, 1n, target, input.value, input.calldataHash, input.selector, input.calldataHash, input.decision, input.reasonCode, deadline, signature] }),
  );
}

async function createContext() {
  const server = ganache.server({ chain: { hardfork: "shanghai" }, logging: { quiet: true }, wallet: { deterministic: true, totalAccounts: 3 } });
  await server.listen(0);
  const addressInfo = server.address();
  if (typeof addressInfo === "string" || addressInfo === null) throw new Error("Unexpected ganache address info.");
  const rpcUrl = `http://127.0.0.1:${addressInfo.port}`;
  const chain = defineChain({ id: 1337, name: "Interlock Test", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
  const initial = Object.values((server.provider as any).getInitialAccounts()) as Array<{ secretKey: Hex }>;
  const account = privateKeyToAccount(initial[0].secretKey);
  const account2 = privateKeyToAccount(initial[1].secretKey);
  const account3 = privateKeyToAccount(initial[2].secretKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const walletClient2 = createWalletClient({ account: account2, chain, transport: http(rpcUrl) });
  return { account, account2, account3, chain, publicClient, walletClient, walletClient2, close: () => server.close() };
}

async function deploy(name: string, args: readonly unknown[] = []) {
  const item = await artifact(name);
  const hash = await ctx.walletClient.deployContract({ abi: item.abi, bytecode: item.bytecode, args });
  const receipt = await wait(hash);
  return receipt.contractAddress!;
}

async function artifactAbi(name: string) {
  return (await artifact(name)).abi as any[];
}

async function artifact(name: string) {
  return JSON.parse(await readFile(path.resolve(import.meta.dirname, "..", "artifacts", `${name}.json`), "utf8"));
}

async function wait(hash: Hex) {
  return ctx.publicClient.waitForTransactionReceipt({ hash });
}
