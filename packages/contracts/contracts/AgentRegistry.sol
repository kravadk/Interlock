// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract AgentRegistry {
    struct Agent {
        address owner;
        string metadataURI;
        uint256 allowedActions;
        uint256 blockedActions;
        uint256 failedSimulations;
        bool exists;
    }

    uint256 public nextAgentId = 1;
    address public immutable contractOwner;
    address public actionAttestation;

    mapping(uint256 => Agent) private agents;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string metadataURI);
    event ActionAttestationUpdated(address indexed actionAttestation);
    event ReputationUpdated(
        uint256 indexed agentId,
        uint8 decision,
        uint8 reasonCode,
        uint256 allowedActions,
        uint256 blockedActions,
        uint256 failedSimulations
    );

    error NotContractOwner();
    error NotActionAttestation();
    error AgentNotFound();
    error ZeroAddress();

    constructor() {
        contractOwner = msg.sender;
    }

    modifier onlyContractOwner() {
        if (msg.sender != contractOwner) revert NotContractOwner();
        _;
    }

    modifier onlyActionAttestation() {
        if (msg.sender != actionAttestation) revert NotActionAttestation();
        _;
    }

    /// @notice Point reputation writes at the authorized ActionAttestation contract. Owner-only.
    /// @param newActionAttestation The ActionAttestation address allowed to call `updateReputation`.
    function setActionAttestation(address newActionAttestation) external onlyContractOwner {
        if (newActionAttestation == address(0)) revert ZeroAddress();
        actionAttestation = newActionAttestation;
        emit ActionAttestationUpdated(newActionAttestation);
    }

    /// @notice Register a new agent owned by the caller and return its id.
    /// @param metadataURI Pointer to the agent's off-chain metadata (URL / IPFS / data URI).
    /// @return agentId The newly assigned agent id.
    function registerAgent(string calldata metadataURI) external returns (uint256 agentId) {
        agentId = nextAgentId++;
        agents[agentId] = Agent({
            owner: msg.sender,
            metadataURI: metadataURI,
            allowedActions: 0,
            blockedActions: 0,
            failedSimulations: 0,
            exists: true
        });
        emit AgentRegistered(agentId, msg.sender, metadataURI);
    }

    /// @notice Increment an agent's reputation counters from a recorded decision. Callable only by
    ///         the authorized ActionAttestation contract.
    /// @param agentId The agent whose counters update.
    /// @param decision 0 = ALLOW, 1 = BLOCK.
    /// @param reasonCode The decision reason code (4 = simulation failure).
    function updateReputation(uint256 agentId, uint8 decision, uint8 reasonCode) external onlyActionAttestation {
        Agent storage agent = agents[agentId];
        if (!agent.exists) revert AgentNotFound();

        if (decision == 0) {
            agent.allowedActions += 1;
        } else if (decision == 1) {
            agent.blockedActions += 1;
        }

        if (reasonCode == 4) {
            agent.failedSimulations += 1;
        }

        emit ReputationUpdated(
            agentId,
            decision,
            reasonCode,
            agent.allowedActions,
            agent.blockedActions,
            agent.failedSimulations
        );
    }

    /// @notice The owner address of an agent. Reverts if the agent does not exist.
    /// @param agentId The agent id to look up.
    function ownerOf(uint256 agentId) external view returns (address) {
        Agent storage agent = agents[agentId];
        if (!agent.exists) revert AgentNotFound();
        return agent.owner;
    }

    /// @notice Full agent record (owner, metadata, reputation counters). Reverts if not found.
    /// @param agentId The agent id to read.
    function getAgent(uint256 agentId) external view returns (Agent memory) {
        Agent storage agent = agents[agentId];
        if (!agent.exists) revert AgentNotFound();
        return agent;
    }
}
