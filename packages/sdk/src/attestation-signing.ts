import { type Account, type Address, type Hex, type WalletClient } from "viem";
import { Decision, ReasonCode, type DecisionLabel, type ReasonCodeLabel } from "@interlock/shared";

export type SignableDecision = {
  agentId: bigint;
  policyId: bigint;
  target: Address;
  value: bigint;
  calldataHash: Hex;
  selector: Hex;
  simulationHash: Hex;
  /** keccak256 commitment to the off-chain evidence object (ActionAttestationV3). */
  evidenceHash: Hex;
  decision: DecisionLabel;
  reasonCode: ReasonCodeLabel;
};

export type AttestationSignature = { signature: Hex; deadline: bigint };

/** EIP-712 typed-data definition matching ActionAttestationV3's ACTION_TYPEHASH. */
export function actionTypedData(params: {
  decision: SignableDecision;
  chainId: number;
  verifyingContract: Address;
  nonce: bigint;
  deadline: bigint;
}) {
  return {
    domain: {
      name: "AgentOps",
      version: "3",
      chainId: params.chainId,
      verifyingContract: params.verifyingContract,
    },
    types: {
      Action: [
        { name: "agentId", type: "uint256" },
        { name: "policyId", type: "uint256" },
        { name: "target", type: "address" },
        { name: "value", type: "uint256" },
        { name: "calldataHash", type: "bytes32" },
        { name: "selector", type: "bytes4" },
        { name: "simulationHash", type: "bytes32" },
        { name: "evidenceHash", type: "bytes32" },
        { name: "decision", type: "uint8" },
        { name: "reasonCode", type: "uint8" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Action" as const,
    message: {
      agentId: params.decision.agentId,
      policyId: params.decision.policyId,
      target: params.decision.target,
      value: params.decision.value,
      calldataHash: params.decision.calldataHash,
      selector: params.decision.selector,
      simulationHash: params.decision.simulationHash,
      evidenceHash: params.decision.evidenceHash,
      decision: Decision[params.decision.decision],
      reasonCode: ReasonCode[params.decision.reasonCode],
      nonce: params.nonce,
      deadline: params.deadline,
    },
  };
}

/**
 * Signs a decision with the attestor account (the off-chain firewall identity).
 * The resulting signature + deadline are passed to ActionAttestationV3.recordAction.
 */
export async function signActionDecision(options: {
  walletClient: WalletClient;
  attestor: Account;
  decision: SignableDecision;
  chainId: number;
  verifyingContract: Address;
  nonce: bigint;
  ttlSeconds?: number;
  now?: number;
}): Promise<AttestationSignature> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const deadline = BigInt(now + (options.ttlSeconds ?? 3600));
  const typed = actionTypedData({
    decision: options.decision,
    chainId: options.chainId,
    verifyingContract: options.verifyingContract,
    nonce: options.nonce,
    deadline,
  });
  const signature = await options.walletClient.signTypedData({
    account: options.attestor,
    ...typed,
  });
  return { signature, deadline };
}
