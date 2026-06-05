import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { Account, WalletClient } from "viem";
import { mantleSepolia } from "@interlock/shared";
import { InterlockFirewall } from "./firewall.js";

const contracts = {
  agentRegistry: "0xe4dfef03e107225f2239cfff955a378a9a8158be",
  policyRegistry: "0xec7608730978b68a8d8c36b5d1f131634621116d",
  actionAttestation: "0x347fb466f3c9bc031560b49973ec05bdadd2d4c4",
} as const;

function fixtureFirewall() {
  const account = privateKeyToAccount("0x0123456789012345678901234567890123456789012345678901234567890123");
  const writeContract = vi.fn(async () => "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const);
  const walletClient = { account, writeContract } as unknown as WalletClient & { account: Account };
  return {
    firewall: new InterlockFirewall({ chain: mantleSepolia, rpcUrl: mantleSepolia.rpcUrls.default.http[0], walletClient, contracts }),
    writeContract,
  };
}

describe("policy administration", () => {
  it("updates policy limits and status", async () => {
    const { firewall, writeContract } = fixtureFirewall();
    await firewall.updatePolicy({ policyId: 7n, maxNativeValue: 10n, maxSlippageBps: 250, active: false });
    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "updatePolicy", args: [7n, 10n, 250, false] }));
  });

  it("updates target and selector permissions", async () => {
    const { firewall, writeContract } = fixtureFirewall();
    await firewall.setTargetAllowed({ policyId: 7n, target: "0x4444444444444444444444444444444444444444", allowed: true });
    await firewall.setSelectorAllowed({ policyId: 7n, selector: "0xd0e30db0", allowed: false });
    expect(writeContract).toHaveBeenNthCalledWith(1, expect.objectContaining({ functionName: "setTargetAllowed" }));
    expect(writeContract).toHaveBeenNthCalledWith(2, expect.objectContaining({ functionName: "setSelectorAllowed" }));
  });
});
