// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IAgentRegistryForReputation {
    struct Agent {
        address owner;
        string metadataURI;
        uint256 allowedActions;
        uint256 blockedActions;
        uint256 failedSimulations;
        bool exists;
    }

    function getAgent(uint256 agentId) external view returns (Agent memory);
}

/// @title ReputationOracle
/// @notice Turns AgentRegistry's raw counters into a single queryable reputation score + tier that
///   third-party contracts can gate on (`meetsThreshold`). Additive + read-only: it never writes,
///   and reads the live AgentRegistry via `getAgent`. (Time-decay is omitted — AgentRegistry stores
///   no per-action timestamps; a documented future enhancement.)
contract ReputationOracle {
    enum Tier {
        UNPROVEN,
        NASCENT,
        ESTABLISHED,
        TRUSTED
    }

    IAgentRegistryForReputation public immutable agentRegistry;

    error ZeroAddress();

    constructor(address agentRegistryAddress) {
        if (agentRegistryAddress == address(0)) revert ZeroAddress();
        agentRegistry = IAgentRegistryForReputation(agentRegistryAddress);
    }

    /// @return scoreBps Pass-rate in basis points (allowed / total * 10000); 5000 for an unproven
    ///   agent with no recorded actions.
    /// @return tier A coarse trust tier derived from score + volume.
    function getScore(uint256 agentId) public view returns (uint256 scoreBps, uint8 tier) {
        IAgentRegistryForReputation.Agent memory a = agentRegistry.getAgent(agentId);
        uint256 total = a.allowedActions + a.blockedActions + a.failedSimulations;
        if (total == 0) {
            return (5000, uint8(Tier.UNPROVEN));
        }
        scoreBps = (a.allowedActions * 10000) / total;
        tier = uint8(_tier(scoreBps, total));
    }

    /// @notice Gate helper: does the agent meet a minimum reputation (basis points)?
    function meetsThreshold(uint256 agentId, uint256 minScoreBps) external view returns (bool) {
        (uint256 scoreBps, ) = getScore(agentId);
        return scoreBps >= minScoreBps;
    }

    function _tier(uint256 scoreBps, uint256 total) private pure returns (Tier) {
        if (total < 3) return Tier.NASCENT;
        if (scoreBps >= 8000 && total >= 10) return Tier.TRUSTED;
        if (scoreBps >= 5000) return Tier.ESTABLISHED;
        return Tier.NASCENT;
    }
}
