import fc from "fast-check";
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

describe("ReputationOracle invariants", () => {
  it("keeps score bounded and equal to allowed / total actions", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 3 }),
        async (allowedCount, blockedCount, failedCount) => {
          const d = await deployCore();
          await registerAgent(d.agentRegistry);
          await createPolicy(d);
          const oracleAbi = await artifactAbi("ReputationOracle");
          const oracle = await deploy("ReputationOracle", [d.agentRegistry]);

          for (let i = 0; i < allowedCount; i++) {
            await recordAction(d, { target: d.agentRegistry, value: 0n, decision: 0, reasonCode: 0, selector: toFunctionSelector("getAgent(uint256)") });
          }
          for (let i = 0; i < blockedCount; i++) {
            await recordAction(d, { target: ctx.account2.address, value: 0n, decision: 1, reasonCode: 1, selector: toFunctionSelector("ownerOf(uint256)") });
          }
          for (let i = 0; i < failedCount; i++) {
            await recordAction(d, { target: d.agentRegistry, value: 0n, decision: 1, reasonCode: 4, selector: toFunctionSelector("getAgent(uint256)") });
          }

          const [scoreBps, tier] = (await ctx.publicClient.readContract({
            address: oracle,
            abi: oracleAbi,
            functionName: "getScore",
            args: [1n],
          })) as [bigint, number];

          const total = allowedCount + blockedCount + failedCount * 2;
          const expected = total === 0 ? 5000n : (BigInt(allowedCount) * 10000n) / BigInt(total);
          expect(scoreBps).toBe(expected);
          expect(scoreBps >= 0n && scoreBps <= 10000n).toBe(true);
          expect(tier >= 0 && tier <= 3).toBe(true);
        },
      ),
      { numRuns: 5 },
    );
  }, 20_000);
});

async function deployCore() {
  const agentRegistry = await deploy("AgentRegistry");
  const policyRegistry = await deploy("PolicyRegistry", [agentRegistry]);
  const actionAttestation = await deploy("ActionAttestationV2", [agentRegistry, policyRegistry, ctx.account.address]);
  await wait(
    await ctx.walletClient.writeContract({
      account: ctx.account,
      chain: ctx.chain,
      address: agentRegistry,
      abi: agentRegistryAbi,
      functionName: "setActionAttestation",
      args: [actionAttestation],
    }),
  );
  return { agentRegistry, policyRegistry, actionAttestation };
}

async function registerAgent(agentRegistry: Address) {
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
}

async function createPolicy(d: Awaited<ReturnType<typeof deployCore>>) {
  await wait(
    await ctx.walletClient.writeContract({
      account: ctx.account,
      chain: ctx.chain,
      address: d.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "createPolicy",
      args: [1n, parseEther("0.02"), 100, [d.agentRegistry], [toFunctionSelector("getAgent(uint256)")]],
    }),
  );
}

async function recordAction(
  d: Awaited<ReturnType<typeof deployCore>>,
  input: { target: Address; value: bigint; decision: number; reasonCode: number; selector: Hex },
) {
  const calldataHash = keccak256(`0x${input.reasonCode.toString(16).padStart(2, "0")}`);
  const actionAttestationV2Abi = await artifactAbi("ActionAttestationV2");
  const nonce = (await ctx.publicClient.readContract({
    address: d.actionAttestation,
    abi: actionAttestationV2Abi,
    functionName: "nonces",
    args: [1n],
  })) as bigint;
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
    message: {
      agentId: 1n,
      policyId: 1n,
      target: input.target,
      value: input.value,
      calldataHash,
      selector: input.selector,
      simulationHash: calldataHash,
      decision: input.decision,
      reasonCode: input.reasonCode,
      nonce,
      deadline,
    },
  });
  await wait(
    await ctx.walletClient.writeContract({
      account: ctx.account,
      chain: ctx.chain,
      address: d.actionAttestation,
      abi: actionAttestationV2Abi,
      functionName: "recordAction",
      args: [
        1n,
        1n,
        input.target,
        input.value,
        calldataHash,
        input.selector,
        calldataHash,
        input.decision,
        input.reasonCode,
        deadline,
        signature,
      ],
    }),
  );
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
  return { account, account2, chain, publicClient, walletClient, close: () => server.close() };
}

async function deploy(name: string, args: readonly unknown[] = []) {
  const item = await artifact(name);
  const hash = await ctx.walletClient.deployContract({ abi: item.abi, bytecode: item.bytecode, args });
  const receipt = await wait(hash);
  return receipt.contractAddress! as Address;
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
