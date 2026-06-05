import type { Account, Address, Chain, Hex, WalletClient } from "viem";
import { ActionBlockedError } from "./errors.js";
import type { InterlockFirewall } from "./firewall.js";
import type { AgentAction, FirewallDecision, GuardedSendResult } from "./types.js";

export type ViemTransactionRequest = {
  to: Address;
  value?: bigint;
  data?: Hex;
};

export type GuardedViemWalletConfig = {
  firewall: InterlockFirewall;
  walletClient: WalletClient & { account: Account };
  agentId: bigint;
  policyId: bigint;
  defaultMetadata?: AgentAction["metadata"];
  recordDecision?: boolean;
  throwOnBlock?: boolean;
  chain?: Chain;
};

export type GuardedViemSendOptions = {
  agentId?: bigint;
  policyId?: bigint;
  metadata?: AgentAction["metadata"];
  recordDecision?: boolean;
  throwOnBlock?: boolean;
};

export type GuardedViemSendResult = GuardedSendResult & {
  originalTx: ViemTransactionRequest;
};

export function createGuardedViemWallet(config: GuardedViemWalletConfig) {
  return {
    walletClient: config.walletClient,
    async sendTransaction(tx: ViemTransactionRequest, options: GuardedViemSendOptions = {}): Promise<GuardedViemSendResult> {
      const action: AgentAction = {
        agentId: options.agentId ?? config.agentId,
        policyId: options.policyId ?? config.policyId,
        tx: {
          to: tx.to,
          value: tx.value ?? 0n,
          data: tx.data ?? "0x",
        },
        metadata: {
          ...config.defaultMetadata,
          ...options.metadata,
        },
      };

      const decision = await config.firewall.checkAction(action);
      const shouldRecord = options.recordDecision ?? config.recordDecision ?? true;
      const shouldThrowOnBlock = options.throwOnBlock ?? config.throwOnBlock ?? true;
      let attestationHash: Hex | undefined;

      if (shouldRecord) {
        attestationHash = await config.firewall.recordDecisionWithWalletClient(decision, config.walletClient);
      }

      if (!decision.allowed) {
        if (shouldThrowOnBlock) {
          throw new ActionBlockedError(decision);
        }

        return {
          decision,
          sent: false,
          attestationHash,
          originalTx: tx,
        };
      }

      const transactionHash = await config.walletClient.sendTransaction({
        account: config.walletClient.account,
        chain: config.chain ?? config.firewall.chain,
        to: tx.to,
        value: tx.value,
        data: tx.data,
      });

      return {
        decision,
        sent: true,
        attestationHash,
        transactionHash,
        originalTx: tx,
      };
    },
  };
}

export function decisionToAgentToolResult(decision: FirewallDecision) {
  return {
    allowed: decision.allowed,
    decision: decision.decision,
    reasonCode: decision.reasonCode,
    riskScore: decision.riskScore,
    explanation: decision.explanation,
    simulationHash: decision.simulationHash,
    calldataHash: decision.calldataHash,
    selector: decision.selector,
    checks: decision.checks,
  };
}
