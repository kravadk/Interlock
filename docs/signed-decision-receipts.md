# Signed Decision Receipts Design

Signed decision receipts are a Public Beta hardening item. They are not required for the current Dev Alpha, but the design prevents the biggest production gap: replaying or misrepresenting an old firewall decision.

## Goal

Bind a firewall decision to:

- agent id;
- policy id;
- target;
- value;
- calldata hash;
- selector;
- simulation hash;
- decision;
- reason code;
- deadline;
- nonce;
- chain id;
- contract addresses.

## EIP-712 Shape

```ts
type InterlockDecision = {
  agentId: bigint;
  policyId: bigint;
  target: Address;
  value: bigint;
  calldataHash: Hex;
  selector: Hex;
  simulationHash: Hex;
  decision: "ALLOW" | "BLOCK" | "REVIEW";
  reasonCode: string;
  deadline: bigint;
  nonce: bigint;
};
```

Domain:

```ts
{
  name: "Interlock Firewall",
  version: "1",
  chainId: 5003,
  verifyingContract: actionAttestation
}
```

## Validation Rules

- Reject expired receipts.
- Reject reused nonces.
- Reject signatures from unauthorized recorders.
- Reject `ALLOW` receipts if the current policy no longer permits target, selector, and value.
- Include `calldataHash` and `simulationHash`; do not store full calldata or simulation traces on-chain.

## Rollout

1. Add off-chain SDK signing helpers.
2. Add contract verifier and nonce storage.
3. Add REST `/preflight` response field `receipt`.
4. Add `/record` support for signed receipts.
5. Keep current alpha `recordAction` as legacy until integrations migrate.
