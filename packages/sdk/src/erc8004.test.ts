import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionData, type Address, type Hex } from "viem";
import {
  erc8004IdentityRegistryAbi,
  erc8004ReputationRegistryAbi,
  getErc8004Agent,
  getErc8004ReputationSummary,
  giveErc8004Feedback,
  registerErc8004Agent,
  setErc8004AgentUri,
} from "./erc8004.js";

const REGISTRY = "0x8004A3718bD35CF767BC0E718bf21Ec4073502f0" as Address;
const REPUTATION = "0x8004B1BcAb4228199Af728fF90Ed23dCc9b0Fa63" as Address;
const ACCOUNT = "0x1111111111111111111111111111111111111111" as Address;
const OWNER = "0x2222222222222222222222222222222222222222" as Address;

// Capture the writeContract args and reconstruct calldata so we assert the encoders target the
// exact official ERC-8004 ABI (not a hand-guessed signature).
function captureWallet() {
  const calls: Array<{ address: Address; functionName: string; args: readonly unknown[] }> = [];
  const walletClient = {
    chain: undefined,
    writeContract: vi.fn(async (req: { address: Address; functionName: string; args: readonly unknown[] }) => {
      calls.push({ address: req.address, functionName: req.functionName, args: req.args });
      return "0xtx" as Hex;
    }),
  } as never;
  return { walletClient, calls };
}

describe("ERC-8004 write encoders (official ABI)", () => {
  it("registerErc8004Agent encodes register(string agentURI)", async () => {
    const { walletClient, calls } = captureWallet();
    const tx = await registerErc8004Agent({ walletClient, account: ACCOUNT, identityRegistry: REGISTRY, agentURI: "https://x/agent/1" });
    expect(tx).toBe("0xtx");
    expect(calls[0]).toMatchObject({ address: REGISTRY, functionName: "register", args: ["https://x/agent/1"] });
    // The args round-trip through the exported ABI without error -> signature matches.
    const data = encode(erc8004IdentityRegistryAbi, "register", ["https://x/agent/1"]);
    expect(decodeFunctionData({ abi: erc8004IdentityRegistryAbi, data }).functionName).toBe("register");
  });

  it("setErc8004AgentUri encodes setAgentURI(uint256, string)", async () => {
    const { walletClient, calls } = captureWallet();
    await setErc8004AgentUri({ walletClient, account: ACCOUNT, identityRegistry: REGISTRY, agentId: 7n, newURI: "ipfs://new" });
    expect(calls[0]).toMatchObject({ functionName: "setAgentURI", args: [7n, "ipfs://new"] });
  });

  it("giveErc8004Feedback encodes the 8-arg giveFeedback with defaults", async () => {
    const { walletClient, calls } = captureWallet();
    await giveErc8004Feedback({ walletClient, account: ACCOUNT, reputationRegistry: REPUTATION, agentId: 3n, value: 9500n, valueDecimals: 2 });
    const call = calls[0];
    expect(call.functionName).toBe("giveFeedback");
    expect(call.args[0]).toBe(3n);
    expect(call.args[1]).toBe(9500n);
    expect(call.args[3]).toBe("interlock"); // default tag1
    // Encodes cleanly against the official ABI shape.
    const data = encode(erc8004ReputationRegistryAbi, "giveFeedback", call.args);
    expect(decodeFunctionData({ abi: erc8004ReputationRegistryAbi, data }).functionName).toBe("giveFeedback");
  });
});

describe("ERC-8004 reads", () => {
  it("getErc8004Agent decodes owner/tokenURI/agentWallet", async () => {
    const publicClient = {
      readContract: vi.fn(async (req: { functionName: string }) => {
        if (req.functionName === "ownerOf") return OWNER;
        if (req.functionName === "tokenURI") return "https://x/agent/1";
        if (req.functionName === "getAgentWallet") return ACCOUNT;
        throw new Error("unexpected");
      }),
    } as never;
    const agent = await getErc8004Agent({ publicClient, identityRegistry: REGISTRY, agentId: 1n });
    expect(agent.owner.toLowerCase()).toBe(OWNER.toLowerCase());
    expect(agent.tokenURI).toBe("https://x/agent/1");
    expect(agent.agentWallet?.toLowerCase()).toBe(ACCOUNT.toLowerCase());
  });

  it("getErc8004ReputationSummary passes string tags and decodes uint64 count", async () => {
    let capturedArgs: readonly unknown[] = [];
    const publicClient = {
      readContract: vi.fn(async (req: { args: readonly unknown[] }) => {
        capturedArgs = req.args;
        return [4n, 9000n, 2] as [bigint, bigint, number];
      }),
    } as never;
    const summary = await getErc8004ReputationSummary({ publicClient, reputationRegistry: REPUTATION, agentId: 1n, clientAddresses: [] });
    expect(summary).toEqual({ count: "4", summaryValue: "9000", summaryValueDecimals: 2 });
    expect(capturedArgs[2]).toBe(""); // tag1 defaults to "" (canonical string tag, not bytes32)
    expect(capturedArgs[3]).toBe("");
  });

  it("getErc8004Agent rejects (caller degrades) when the agent is not registered", async () => {
    const publicClient = {
      readContract: vi.fn(async () => {
        throw new Error("ERC721NonexistentToken");
      }),
    } as never;
    await expect(getErc8004Agent({ publicClient, identityRegistry: REGISTRY, agentId: 999n })).rejects.toThrow();
  });
});

// Local helper: encode against the exported ABI to prove the captured args are ABI-valid.
function encode(abi: typeof erc8004IdentityRegistryAbi | typeof erc8004ReputationRegistryAbi, fn: string, args: readonly unknown[]): Hex {
  return encodeFunctionData({ abi, functionName: fn as never, args: args as never });
}
