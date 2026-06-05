import type { Address } from "viem";

export type InterlockDeploymentAddresses = {
  agentRegistry: Address;
  policyRegistry: Address;
  actionAttestation: Address;
  policyGuardedExecutor?: Address;
  disputeEscrow?: Address;
  attestorCommittee?: Address;
  reputationOracle?: Address;
  testStrategyVault?: Address;
  testStrategyRouter?: Address;
  erc8004IdentityRegistry?: Address;
  erc8004ReputationRegistry?: Address;
};

export const deployedAddresses: { mantleSepolia: InterlockDeploymentAddresses } = {
  mantleSepolia: {
    agentRegistry: "0xa8d6f3478b683ee674ff5a9167e6838c589162b4" as Address,
    policyRegistry: "0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0" as Address,
    // ActionAttestationV3 (evidenceHash + extended ReasonCode). V2 was 0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3.
    actionAttestation: "0xe95ae15769d4afb678360622ff4e7f9db7dd874d" as Address,
    policyGuardedExecutor: "0xd12a01a676f66c7660119e1c9a0fe3521ccdd564" as Address,
    disputeEscrow: "0xcb463c978becd38e913fb4b063f1e0aff8e04210" as Address,
    attestorCommittee: "0x03e42606199f1832579941c9a947e8eb240d1cef" as Address,
    reputationOracle: "0x69acc876f018677f9ed4f54b183d1703edd9d120" as Address,
  },
};
