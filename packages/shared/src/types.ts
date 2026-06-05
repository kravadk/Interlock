export const Decision = {
  ALLOW: 0,
  BLOCK: 1,
  REVIEW: 2,
} as const;

export const DecisionName = {
  0: "ALLOW",
  1: "BLOCK",
  2: "REVIEW",
} as const;

export const ReasonCode = {
  POLICY_PASSED: 0,
  TARGET_NOT_ALLOWED: 1,
  VALUE_LIMIT_EXCEEDED: 2,
  SLIPPAGE_LIMIT_EXCEEDED: 3,
  SIMULATION_FAILED: 4,
  UNKNOWN_SELECTOR: 5,
  // V3 advisory risk codes (recordable on ActionAttestationV3; advisory-only on V2).
  RWA_OVEREXPOSURE: 6,
  CONCENTRATION_RISK: 7,
  DAILY_REBALANCE_EXCEEDED: 8,
  STALE_POLICY: 9,
  WRONG_CHAIN: 10,
} as const;

export const ReasonCodeName = {
  0: "POLICY_PASSED",
  1: "TARGET_NOT_ALLOWED",
  2: "VALUE_LIMIT_EXCEEDED",
  3: "SLIPPAGE_LIMIT_EXCEEDED",
  4: "SIMULATION_FAILED",
  5: "UNKNOWN_SELECTOR",
  6: "RWA_OVEREXPOSURE",
  7: "CONCENTRATION_RISK",
  8: "DAILY_REBALANCE_EXCEEDED",
  9: "STALE_POLICY",
  10: "WRONG_CHAIN",
} as const;

/** Reason codes that exist only on ActionAttestationV3 — advisory-only when recording to V2. */
export const V3_ONLY_REASON_CODES = [6, 7, 8, 9, 10] as const;

export type DecisionValue = (typeof Decision)[keyof typeof Decision];
export type DecisionLabel = keyof typeof Decision;
export type ReasonCodeValue = (typeof ReasonCode)[keyof typeof ReasonCode];
export type ReasonCodeLabel = keyof typeof ReasonCode;

// ActionAttestationV2 dispute-window status.
export const AttestationStatus = {
  ACTIVE: 0,
  CHALLENGED: 1,
  FINALIZED: 2,
} as const;

export const AttestationStatusName = {
  0: "ACTIVE",
  1: "CHALLENGED",
  2: "FINALIZED",
} as const;

export type AttestationStatusValue = (typeof AttestationStatus)[keyof typeof AttestationStatus];
export type AttestationStatusLabel = keyof typeof AttestationStatus;
