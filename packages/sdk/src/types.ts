import type { Account, Address, Chain, Hex, WalletClient } from "viem";
import type { AttestationStatusLabel, DecisionLabel, ReasonCodeLabel } from "@interlock/shared";
import type { PolicyPack } from "./policy-pack.js";

export type InterlockContracts = {
  agentRegistry: Address;
  policyRegistry: Address;
  actionAttestation: Address;
};

export type InterlockFirewallConfig = {
  chain: Chain;
  rpcUrl: string;
  privateKey?: Hex;
  account?: Account;
  walletClient?: WalletClient;
  contracts: InterlockContracts;
  /** Attestor that signs decisions for ActionAttestationV3 (EIP-712). */
  attestor?: Account;
  attestorPrivateKey?: Hex;
};

export type AgentAction = {
  agentId: bigint;
  policyId: bigint;
  tx: {
    to: Address;
    value: bigint;
    data: Hex;
  };
  metadata?: {
    intent?: string;
    route?: string;
    expectedSlippageBps?: number;
  };
};

export type AgentActionBundle = {
  bundleId?: string;
  agentId: bigint;
  policyId: bigint;
  intent: string;
  actions: AgentAction[];
  metadata?: {
    source?: "manual" | "agent" | "goat" | "agentkit" | "byreal" | "route";
    routeProvider?: "1inch" | "odos" | "axelar" | "manual";
    expectedSlippageBps?: number;
  };
};

export type AgentActionBundleReport = {
  bundleId: string;
  agentId: bigint;
  policyId: bigint;
  intent: string;
  allowed: boolean;
  decision: "ALLOW" | "BLOCK";
  reasonCode: string;
  riskScore: number;
  actionCount: number;
  bundleHash: Hex;
  decisions: FirewallDecision[];
  summary: string;
};

export type RegisterAgentInput = {
  metadataURI: string;
};

export type RegisterAgentResult = {
  agentId: bigint;
  owner: Address;
  metadataURI: string;
  transactionHash: Hex;
  blockNumber: bigint;
};

export type CreatePolicyInput = {
  agentId: bigint;
  maxNativeValue: bigint;
  maxSlippageBps: number;
  targets: Address[];
  selectors: Hex[];
};

export type CreatePolicyResult = {
  policyId: bigint;
  agentId: bigint;
  owner: Address;
  maxNativeValue: bigint;
  maxSlippageBps: number;
  transactionHash: Hex;
  blockNumber: bigint;
};

export type CreatePolicyFromPresetInput = {
  agentId: bigint;
  preset: {
    maxNativeValue: bigint;
    maxSlippageBps: number;
    targets: Address[];
    selectors: Hex[];
  };
};

export type UpdatePolicyInput = {
  policyId: bigint;
  maxNativeValue: bigint;
  maxSlippageBps: number;
  active: boolean;
};

export type SetTargetAllowedInput = {
  policyId: bigint;
  target: Address;
  allowed: boolean;
};

export type SetSelectorAllowedInput = {
  policyId: bigint;
  selector: Hex;
  allowed: boolean;
};

export type PolicyPermissionCheckInput = {
  policyId: bigint;
  target?: Address;
  selector?: Hex;
};

export type PolicyPermissionCheckResult = {
  policyId: bigint;
  target?: Address;
  selector?: Hex;
  targetAllowed?: boolean;
  selectorAllowed?: boolean;
};

export type PolicyPackAuditInput = {
  policyId: bigint;
  pack: PolicyPack;
  expectedAgentId?: bigint;
  expectedActive?: boolean;
  allowLegacyPartialAudit?: boolean;
};

export type PolicyPackAuditMismatchCode =
  | "AGENT_ID_MISMATCH"
  | "MAX_NATIVE_VALUE_MISMATCH"
  | "MAX_SLIPPAGE_BPS_MISMATCH"
  | "ACTIVE_STATE_MISMATCH"
  | "TARGET_NOT_ALLOWED"
  | "SELECTOR_NOT_ALLOWED"
  | "TARGET_NOT_IN_PACK"
  | "SELECTOR_NOT_IN_PACK";

export type PolicyPackAuditMismatch = {
  code: PolicyPackAuditMismatchCode;
  message: string;
  expected?: string | number | boolean;
  actual?: string | number | boolean;
  target?: Address;
  selector?: Hex;
};

export type PolicyPackAuditResult = {
  ok: boolean;
  policyId: bigint;
  policy: AgentPolicy;
  expected: {
    agentId?: bigint;
    maxNativeValue: bigint;
    maxSlippageBps: number;
    active: boolean;
    targetCount: number;
    selectorCount: number;
  };
  targetChecks: Array<{ target: Address; label?: string; allowed: boolean }>;
  selectorChecks: Array<{ selector: Hex; label?: string; allowed: boolean }>;
  onChainTargets: Address[];
  onChainSelectors: Hex[];
  extraTargets: Address[];
  extraSelectors: Hex[];
  mismatches: PolicyPackAuditMismatch[];
};

export type PolicyPackApplyInput = PolicyPackAuditInput & {
  dryRun?: boolean;
  waitForReceipts?: boolean;
  prune?: boolean;
};

export type PolicyPackApplyOperation =
  | {
      type: "UPDATE_POLICY";
      maxNativeValue: bigint;
      maxSlippageBps: number;
      active: boolean;
    }
  | {
      type: "ALLOW_TARGET";
      target: Address;
      label?: string;
    }
  | {
      type: "ALLOW_SELECTOR";
      selector: Hex;
      label?: string;
    }
  | {
      type: "DENY_TARGET";
      target: Address;
    }
  | {
      type: "DENY_SELECTOR";
      selector: Hex;
    };

export type PolicyPackApplyTransaction = PolicyPackApplyOperation & {
  transactionHash: Hex;
  blockNumber?: bigint;
};

export type PolicyPackApplyResult = {
  ok: boolean;
  dryRun: boolean;
  policyId: bigint;
  auditBefore: PolicyPackAuditResult;
  plannedOperations: PolicyPackApplyOperation[];
  transactions: PolicyPackApplyTransaction[];
  skippedMismatches: PolicyPackAuditMismatch[];
  auditAfter?: PolicyPackAuditResult;
};

export type FirewallDecision = {
  allowed: boolean;
  decision: DecisionLabel;
  reasonCode: ReasonCodeLabel;
  riskScore: number;
  simulationHash: Hex;
  calldataHash: Hex;
  selector: Hex;
  explanation: string;
  tx: AgentAction["tx"];
  agentId: bigint;
  policyId: bigint;
  simulation: {
    success: boolean;
    error?: string;
  };
  checks: {
    targetAllowed: boolean;
    selectorAllowed: boolean;
    valueWithinLimit: boolean;
    slippageWithinLimit: boolean;
    policyActive: boolean;
  };
};

export type GuardedSendOptions = {
  recordDecision?: boolean;
  recordTiming?: "before-send" | "after-send";
  throwOnBlock?: boolean;
};

export type GuardedSendResult = {
  decision: FirewallDecision;
  sent: boolean;
  attestationHash?: Hex;
  transactionHash?: Hex;
};

export type GatewayMode = "dry-run" | "record-only" | "execute-if-allowed" | "block-and-alert";

export type GatewayActionOptions = {
  mode?: GatewayMode;
  recordDecision?: boolean;
  recordTiming?: "before-send" | "after-send";
  throwOnBlock?: boolean;
};

export type GatewayActionResult = {
  mode: GatewayMode;
  status: "allowed" | "blocked" | "executed" | "recorded" | "alert";
  decision: FirewallDecision;
  sent: boolean;
  recorded: boolean;
  transactionHash?: Hex;
  attestationHash?: Hex;
  alert?: {
    event: "action.blocked";
    reasonCode: FirewallDecision["reasonCode"];
    agentId: string;
    policyId: string;
    target: Address;
    selector: Hex;
    value: string;
  };
  nextAction: string;
};

export type AgentPolicy = {
  owner: Address;
  agentId: bigint;
  maxNativeValue: bigint;
  maxSlippageBps: number;
  active: boolean;
};

export type AgentStats = {
  owner: Address;
  metadataURI: string;
  allowedActions: bigint;
  blockedActions: bigint;
  failedSimulations: bigint;
  exists: boolean;
};

export type ActionHistoryFilters = {
  agentId?: bigint;
  policyId?: bigint;
  fromBlock?: bigint;
  toBlock?: bigint | "latest";
};

export type ActionHistoryEntry = {
  actionCheckId: bigint;
  agentId: bigint;
  policyId: bigint;
  target: Address;
  value: bigint;
  calldataHash: Hex;
  selector: Hex;
  simulationHash: Hex;
  decision: DecisionLabel;
  reasonCode: ReasonCodeLabel;
  timestamp: bigint;
  transactionHash: Hex;
  blockNumber: bigint;
  /** ActionAttestationV2/V3 dispute-window fields (undefined for legacy V1 events). */
  status?: AttestationStatusLabel;
  finalizableAt?: bigint;
  /** ActionAttestationV3 evidence commitment (undefined for V1/V2 events). */
  evidenceHash?: Hex;
};

export type RecordDecisionResult = ActionHistoryEntry;
