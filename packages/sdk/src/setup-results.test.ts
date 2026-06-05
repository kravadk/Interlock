import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, getAddress, zeroAddress, type Hex } from "viem";
import { actionAttestationAbi, agentRegistryAbi, policyRegistryAbi } from "@interlock/shared";
import {
  SetupEventNotFoundError,
  actionCheckedFromReceipt,
  agentRegistrationFromReceipt,
  policyCreationFromReceipt,
  type ReceiptLike,
} from "./setup-results.js";

const agentRegistry = "0xe4dfef03e107225f2239cfff955a378a9a8158be";
const policyRegistry = "0xec7608730978b68a8d8c36b5d1f131634621116d";
const actionAttestation = "0x3333333333333333333333333333333333333333";
const owner = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const checksumOwner = getAddress(owner);

describe("setup result helpers", () => {
  it("extracts AgentRegistered from a receipt", () => {
    const receipt: ReceiptLike = {
      transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      blockNumber: 123n,
      logs: [
        {
          address: agentRegistry,
          topics: encodeEventTopics({
            abi: agentRegistryAbi,
            eventName: "AgentRegistered",
            args: { agentId: 7n, owner },
          }),
          data: encodeAbiParameters([{ type: "string" }], ["ipfs://agent"]),
        },
      ],
    };

    expect(agentRegistrationFromReceipt(receipt, agentRegistry)).toEqual({
      agentId: 7n,
      owner: checksumOwner,
      metadataURI: "ipfs://agent",
      transactionHash: receipt.transactionHash,
      blockNumber: 123n,
    });
  });

  it("extracts PolicyCreated from a receipt", () => {
    const receipt: ReceiptLike = {
      transactionHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      blockNumber: 124n,
      logs: [
        {
          address: policyRegistry,
          topics: encodeEventTopics({
            abi: policyRegistryAbi,
            eventName: "PolicyCreated",
            args: { policyId: 3n, agentId: 7n, owner },
          }),
          data: encodeAbiParameters([{ type: "uint256" }, { type: "uint16" }], [1000n, 100]),
        },
      ],
    };

    expect(policyCreationFromReceipt(receipt, policyRegistry)).toEqual({
      policyId: 3n,
      agentId: 7n,
      owner: checksumOwner,
      maxNativeValue: 1000n,
      maxSlippageBps: 100,
      transactionHash: receipt.transactionHash,
      blockNumber: 124n,
    });
  });

  it("throws when the expected setup event is missing", () => {
    const receipt: ReceiptLike = {
      transactionHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      blockNumber: 125n,
      logs: [{ address: zeroAddress, topics: [] as Hex[], data: "0x" }],
    };

    expect(() => agentRegistrationFromReceipt(receipt, agentRegistry)).toThrow(SetupEventNotFoundError);
  });

  it("extracts ActionChecked from a receipt", () => {
    const receipt: ReceiptLike = {
      transactionHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      blockNumber: 126n,
      logs: [
        {
          address: actionAttestation,
          topics: encodeEventTopics({
            abi: actionAttestationAbi,
            eventName: "ActionChecked",
            args: { actionCheckId: 9n, agentId: 7n, policyId: 3n },
          }),
          data: encodeAbiParameters(
            [
              { type: "address" },
              { type: "uint256" },
              { type: "bytes32" },
              { type: "bytes4" },
              { type: "bytes32" },
              { type: "uint8" },
              { type: "uint8" },
              { type: "uint256" },
              { type: "uint8" },
              { type: "uint256" },
              { type: "bytes32" },
            ],
            [
              "0x4444444444444444444444444444444444444444",
              1000n,
              "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              "0xd0e30db0",
              "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              0,
              0,
              1710000000n,
              0,
              1710007200n,
              "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            ],
          ),
        },
      ],
    };

    expect(actionCheckedFromReceipt(receipt, actionAttestation)).toEqual({
      actionCheckId: 9n,
      agentId: 7n,
      policyId: 3n,
      target: "0x4444444444444444444444444444444444444444",
      value: 1000n,
      calldataHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      selector: "0xd0e30db0",
      simulationHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      decision: "ALLOW",
      reasonCode: "POLICY_PASSED",
      timestamp: 1710000000n,
      transactionHash: receipt.transactionHash,
      blockNumber: 126n,
      status: "ACTIVE",
      finalizableAt: 1710007200n,
      evidenceHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    });
  });
});
