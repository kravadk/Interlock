import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import { buildDoctorReport } from "./doctor.js";

const contracts = {
  agentRegistry: zeroAddress,
  policyRegistry: zeroAddress,
  actionAttestation: zeroAddress,
} as const;

describe("doctor", () => {
  it("reports reachable RPC and missing contracts", async () => {
    const report = await buildDoctorReport({
      rpcUrl: "http://rpc.local",
      contracts,
      privateKeyConfigured: false,
      publicClient: {
        getChainId: async () => 5003,
        getBlockNumber: async () => 10n,
        getBytecode: async () => "0x",
        readContract: async () => true,
      },
    });

    expect(report.rpc.reachable).toBe(true);
    expect(report.contracts.agentRegistry.configured).toBe(false);
    expect(report.ok).toBe(false);
  });

  it("marks report ok when RPC, contracts, and key are configured", async () => {
    const configuredContracts = {
      agentRegistry: "0xe4dfef03e107225f2239cfff955a378a9a8158be",
      policyRegistry: "0xec7608730978b68a8d8c36b5d1f131634621116d",
      actionAttestation: "0x3333333333333333333333333333333333333333",
    } as const;

    const report = await buildDoctorReport({
      rpcUrl: "http://rpc.local",
      contracts: configuredContracts,
      privateKeyConfigured: true,
      publicClient: {
        getChainId: async () => 5003,
        getBlockNumber: async () => 10n,
        getBytecode: async () => "0x1234",
        readContract: async ({ functionName }) => (functionName === "VERSION" ? "1.2.0" : true),
      },
    });

    expect(report.ok).toBe(true);
    expect(report.contracts.policyRegistry.compatibility?.policyEnumeration?.supported).toBe(true);
    expect(report.contracts.policyRegistry.compatibility?.policyEnumeration?.version).toBe("1.2.0");
  });

  it("marks report not ok for old policy registries without enumeration support", async () => {
    const configuredContracts = {
      agentRegistry: "0xe4dfef03e107225f2239cfff955a378a9a8158be",
      policyRegistry: "0xec7608730978b68a8d8c36b5d1f131634621116d",
      actionAttestation: "0x3333333333333333333333333333333333333333",
    } as const;

    const report = await buildDoctorReport({
      rpcUrl: "http://rpc.local",
      contracts: configuredContracts,
      privateKeyConfigured: true,
      publicClient: {
        getChainId: async () => 5003,
        getBlockNumber: async () => 10n,
        getBytecode: async () => "0x1234",
        readContract: async () => {
          throw new Error("function selector was not recognized");
        },
      },
    });

    expect(report.ok).toBe(false);
    expect(report.contracts.policyRegistry.compatibility?.policyEnumeration?.supported).toBe(false);
  });

  it("handles RPC failures", async () => {
    const report = await buildDoctorReport({
      rpcUrl: "http://rpc.local",
      contracts,
      privateKeyConfigured: false,
      publicClient: {
        getChainId: async () => {
          throw new Error("down");
        },
        getBlockNumber: async () => 0n,
        getBytecode: async () => "0x",
        readContract: async () => true,
      },
    });

    expect(report.rpc.reachable).toBe(false);
    expect(report.ok).toBe(false);
  });
});
