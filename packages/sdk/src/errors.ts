import type { FirewallDecision } from "./types.js";

export class InterlockError extends Error {
  readonly code: string;
  readonly cause?: unknown;
  readonly action: string;

  constructor(code: string, message: string, options: { cause?: unknown; action?: string } = {}) {
    super(message);
    this.name = "InterlockError";
    this.code = code;
    this.cause = options?.cause;
    this.action = options.action ?? "Inspect the original error and verify the Interlock configuration, RPC endpoint, contract addresses, and transaction input.";
  }
}

export class ActionBlockedError extends InterlockError {
  readonly decision: FirewallDecision;

  constructor(decision: FirewallDecision) {
    super("ACTION_BLOCKED", `Agent action blocked: ${decision.reasonCode}`, {
      action: `Do not send this transaction. Review decision.checks and fix the policy or proposed transaction before retrying.`,
    });
    this.name = "ActionBlockedError";
    this.decision = decision;
  }
}

export class PolicyReadError extends InterlockError {
  constructor(policyId: bigint, cause: unknown) {
    super("POLICY_READ_FAILED", `Failed to read policy ${policyId.toString()}.`, {
      cause,
      action: "Verify the policy id exists on the selected chain and the PolicyRegistry address/RPC URL are correct.",
    });
    this.name = "PolicyReadError";
  }
}

export class AgentReadError extends InterlockError {
  constructor(agentId: bigint, cause: unknown) {
    super("AGENT_READ_FAILED", `Failed to read agent ${agentId.toString()}.`, {
      cause,
      action: "Verify the agent id exists on the selected chain and the AgentRegistry address/RPC URL are correct.",
    });
    this.name = "AgentReadError";
  }
}

export class AttestationFailedError extends InterlockError {
  constructor(cause: unknown) {
    super("ATTESTATION_FAILED", "Failed to record firewall decision on-chain.", {
      cause,
      action: "Check wallet funds, wallet chain, policy ownership, and whether an ALLOW decision still satisfies the on-chain policy.",
    });
    this.name = "AttestationFailedError";
  }
}

export class WalletClientRequiredError extends InterlockError {
  constructor(method: string) {
    super("WALLET_CLIENT_REQUIRED", `${method} requires a privateKey or account in InterlockFirewall config.`, {
      action: "Pass a privateKey, account, or walletClient for write methods. Use read-only methods without a wallet.",
    });
    this.name = "WalletClientRequiredError";
  }
}

export class AgentRegistrationFailedError extends InterlockError {
  constructor(cause: unknown) {
    super("AGENT_REGISTRATION_FAILED", "Failed to register agent on-chain.", {
      cause,
      action: "Verify the wallet is on Mantle Sepolia, has test MNT, and uses the deployed AgentRegistry address.",
    });
    this.name = "AgentRegistrationFailedError";
  }
}

export class PolicyCreationFailedError extends InterlockError {
  constructor(cause: unknown) {
    super("POLICY_CREATION_FAILED", "Failed to create agent policy on-chain.", {
      cause,
      action: "Verify the agent id, maxNativeValue, selector bytes4 values, target addresses, wallet ownership, and PolicyRegistry address.",
    });
    this.name = "PolicyCreationFailedError";
  }
}

export class PolicyUpdateFailedError extends InterlockError {
  constructor(cause: unknown) {
    super("POLICY_UPDATE_FAILED", "Failed to update agent policy on-chain.", {
      cause,
      action: "Verify the connected wallet owns the policy and the target/selector/update values are valid.",
    });
    this.name = "PolicyUpdateFailedError";
  }
}

export class ContractCompatibilityError extends InterlockError {
  constructor(message: string, cause?: unknown) {
    super("CONTRACT_COMPATIBILITY_ERROR", message, {
      cause,
      action: "Use the current Interlock contract deployment or enable the documented legacy partial-audit mode where supported.",
    });
    this.name = "ContractCompatibilityError";
  }
}

export function actionableError(error: unknown): { code: string; message: string; action: string } {
  if (error instanceof InterlockError) {
    return { code: error.code, message: error.message, action: error.action };
  }

  return {
    code: "AGENTOPS_UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : String(error),
    action: "Retry after checking RPC availability, input values, wallet state, and the latest application logs.",
  };
}

export function assertAllowed(decision: FirewallDecision) {
  if (!decision.allowed) {
    throw new ActionBlockedError(decision);
  }
}
