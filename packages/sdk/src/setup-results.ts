import { decodeEventLog, type Address, type Hex } from "viem";
import {
  parseActionCheckedArgs,
  actionAttestationAbi,
  agentRegistryAbi,
  policyRegistryAbi,
} from "@interlock/shared";
import type { CreatePolicyResult, RecordDecisionResult, RegisterAgentResult } from "./types.js";

export type ReceiptLog = {
  address: Address;
  data: Hex;
  topics: readonly Hex[];
};

export type ReceiptLike = {
  transactionHash: Hex;
  blockNumber: bigint | null;
  logs: ReceiptLog[];
};

export class SetupEventNotFoundError extends Error {
  constructor(eventName: string, transactionHash: Hex) {
    super(`Could not find ${eventName} in transaction receipt ${transactionHash}.`);
    this.name = "SetupEventNotFoundError";
  }
}

export function agentRegistrationFromReceipt(receipt: ReceiptLike, agentRegistry: Address): RegisterAgentResult {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== agentRegistry.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: agentRegistryAbi,
        data: log.data,
        topics: mutableTopics(log.topics),
      });
      if (decoded.eventName !== "AgentRegistered") continue;
      return {
        agentId: decoded.args.agentId,
        owner: decoded.args.owner,
        metadataURI: decoded.args.metadataURI,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber ?? 0n,
      };
    } catch {
      continue;
    }
  }

  throw new SetupEventNotFoundError("AgentRegistered", receipt.transactionHash);
}

export function policyCreationFromReceipt(receipt: ReceiptLike, policyRegistry: Address): CreatePolicyResult {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== policyRegistry.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: policyRegistryAbi,
        data: log.data,
        topics: mutableTopics(log.topics),
      });
      if (decoded.eventName !== "PolicyCreated") continue;
      return {
        policyId: decoded.args.policyId,
        agentId: decoded.args.agentId,
        owner: decoded.args.owner,
        maxNativeValue: decoded.args.maxNativeValue,
        maxSlippageBps: decoded.args.maxSlippageBps,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber ?? 0n,
      };
    } catch {
      continue;
    }
  }

  throw new SetupEventNotFoundError("PolicyCreated", receipt.transactionHash);
}

export function actionCheckedFromReceipt(receipt: ReceiptLike, actionAttestation: Address): RecordDecisionResult {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== actionAttestation.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: actionAttestationAbi,
        data: log.data,
        topics: mutableTopics(log.topics),
      });
      if (decoded.eventName !== "ActionChecked") continue;
      const parsed = parseActionCheckedArgs(decoded.args);
      if (!parsed) continue;
      return {
        ...parsed,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber ?? 0n,
      };
    } catch {
      continue;
    }
  }

  throw new SetupEventNotFoundError("ActionChecked", receipt.transactionHash);
}

function mutableTopics(topics: readonly Hex[]) {
  return [...topics] as [] | [signature: Hex, ...args: Hex[]];
}
