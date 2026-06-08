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
  // Committee-verified recording (V4) + token-rule enforcement guard. Populated on deploy.
  actionAttestationV4?: Address;
  tokenGuardedExecutor?: Address;
};

export const deployedAddresses: { mantleSepolia: InterlockDeploymentAddresses } = {
  mantleSepolia: {
    agentRegistry: "0xa8d6f3478b683ee674ff5a9167e6838c589162b4" as Address,
    policyRegistry: "0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0" as Address,
    // Active attestation contract = ActionAttestationV4 (committee-verified recording, m-of-n).
    // Deprecated: V3 0xe95ae15769d4afb678360622ff4e7f9db7dd874d, V2 0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3.
    actionAttestation: "0x69a2ec64285caa68934c4ee1c2f4fab29b08c083" as Address,
    policyGuardedExecutor: "0xd12a01a676f66c7660119e1c9a0fe3521ccdd564" as Address,
    disputeEscrow: "0xcb463c978becd38e913fb4b063f1e0aff8e04210" as Address,
    attestorCommittee: "0x03e42606199f1832579941c9a947e8eb240d1cef" as Address,
    reputationOracle: "0x69acc876f018677f9ed4f54b183d1703edd9d120" as Address,
    // Official ERC-8004 "Trustless Agents" registries — verified-deployed by mantlenetworkio on
    // Mantle (mainnet + Sepolia share these addresses). NOT Interlock-owned and NOT placeholders:
    // https://github.com/mantlenetworkio/erc-8004-contracts. Interlock reads identity + reputation
    // from these and can register Interlock agents into the official IdentityRegistry. Env vars
    // ERC8004_IDENTITY_REGISTRY / ERC8004_REPUTATION_REGISTRY override for other chains/forks.
    erc8004IdentityRegistry: "0x8004A3718bD35CF767BC0E718bf21Ec4073502f0" as Address,
    erc8004ReputationRegistry: "0x8004B1BcAb4228199Af728fF90Ed23dCc9b0Fa63" as Address,
    // TokenGuardedExecutor (token-rule enforcement, block 39644566) — live + usable (additive).
    // ActionAttestationV4 (committee recording, block 39644615) is the ACTIVE attestation contract
    // (`actionAttestation` above points to it; AgentRegistry is re-pointed). V3 kept for history.
    tokenGuardedExecutor: "0x4ab52cbfaf06afc1058c4bb05d7fb1511df01258" as Address,
    actionAttestationV4: "0x69a2ec64285caa68934c4ee1c2f4fab29b08c083" as Address,
    // Strategy-agent venue (deployed 2026-06-09) — the AI yield-strategy demo allocates into this vault
    // via the router, every move guarded by the firewall. Demo agent/policy = 13/13 (server env).
    testStrategyVault: "0x15e08d2aa6eed0f39f35554c46558749cead26c0" as Address,
    testStrategyRouter: "0x0b62f5482e557e31ffd1690fa9faacaa1dd62a6b" as Address,
  },
};
