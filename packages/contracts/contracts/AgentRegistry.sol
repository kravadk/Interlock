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

    function setActionAttestation(address newActionAttestation) external onlyContractOwner {
        if (newActionAttestation == address(0)) revert ZeroAddress();
        actionAttestation = newActionAttestation;
        emit ActionAttestationUpdated(newActionAttestation);
    }

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

    function ownerOf(uint256 agentId) external view returns (address) {
        Agent storage agent = agents[agentId];
        if (!agent.exists) revert AgentNotFound();
        return agent.owner;
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        Agent storage agent = agents[agentId];
        if (!agent.exists) revert AgentNotFound();
        return agent;
    }
}
