// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IAgentRegistryForAttestation {
    function updateReputation(uint256 agentId, uint8 decision, uint8 reasonCode) external;
}

interface IPolicyRegistryForAttestation {
    struct Policy {
        address owner;
        uint256 agentId;
        uint256 maxNativeValue;
        uint16 maxSlippageBps;
        bool active;
    }

    function ownerOf(uint256 policyId) external view returns (address);
    function getPolicy(uint256 policyId) external view returns (Policy memory);
    function isTargetAllowed(uint256 policyId, address target) external view returns (bool);
    function isSelectorAllowed(uint256 policyId, bytes4 selector) external view returns (bool);
}

contract ActionAttestation {
    enum Decision {
        ALLOW,
        BLOCK,
        REVIEW
    }

    enum ReasonCode {
        POLICY_PASSED,
        TARGET_NOT_ALLOWED,
        VALUE_LIMIT_EXCEEDED,
        SLIPPAGE_LIMIT_EXCEEDED,
        SIMULATION_FAILED,
        UNKNOWN_SELECTOR
    }

    struct ActionCheck {
        uint256 agentId;
        uint256 policyId;
        address target;
        uint256 value;
        bytes32 calldataHash;
        bytes4 selector;
        bytes32 simulationHash;
        Decision decision;
        ReasonCode reasonCode;
        uint256 timestamp;
    }

    uint256 public nextActionCheckId = 1;
    IAgentRegistryForAttestation public immutable agentRegistry;
    IPolicyRegistryForAttestation public immutable policyRegistry;

    mapping(uint256 => ActionCheck) private actionChecks;

    event ActionChecked(
        uint256 indexed actionCheckId,
        uint256 indexed agentId,
        uint256 indexed policyId,
        address target,
        uint256 value,
        bytes32 calldataHash,
        bytes4 selector,
        bytes32 simulationHash,
        Decision decision,
        ReasonCode reasonCode,
        uint256 timestamp
    );

    error PolicyOwnerOnly();
    error PolicyAgentMismatch();
    error InactivePolicy();
    error AllowedActionTargetNotAllowed();
    error AllowedActionSelectorNotAllowed();
    error AllowedActionValueLimitExceeded();
    error EmptyTarget();
    error InvalidDecisionReason();

    constructor(address agentRegistryAddress, address policyRegistryAddress) {
        agentRegistry = IAgentRegistryForAttestation(agentRegistryAddress);
        policyRegistry = IPolicyRegistryForAttestation(policyRegistryAddress);
    }

    function recordAction(
        uint256 agentId,
        uint256 policyId,
        address target,
        uint256 value,
        bytes32 calldataHash,
        bytes4 selector,
        bytes32 simulationHash,
        Decision decision,
        ReasonCode reasonCode
    ) external returns (uint256 actionCheckId) {
        if (policyRegistry.ownerOf(policyId) != msg.sender) revert PolicyOwnerOnly();
        if (target == address(0)) revert EmptyTarget();
        if (!_isDecisionReasonPairValid(decision, reasonCode)) revert InvalidDecisionReason();

        IPolicyRegistryForAttestation.Policy memory policy = policyRegistry.getPolicy(policyId);
        if (!policy.active) revert InactivePolicy();
        if (policy.agentId != agentId) revert PolicyAgentMismatch();
        if (decision == Decision.ALLOW) {
            if (!policyRegistry.isTargetAllowed(policyId, target)) revert AllowedActionTargetNotAllowed();
            if (!policyRegistry.isSelectorAllowed(policyId, selector)) revert AllowedActionSelectorNotAllowed();
            if (value > policy.maxNativeValue) revert AllowedActionValueLimitExceeded();
        }

        actionCheckId = nextActionCheckId++;
        ActionCheck memory check = ActionCheck({
            agentId: agentId,
            policyId: policyId,
            target: target,
            value: value,
            calldataHash: calldataHash,
            selector: selector,
            simulationHash: simulationHash,
            decision: decision,
            reasonCode: reasonCode,
            timestamp: block.timestamp
        });

        actionChecks[actionCheckId] = check;

        emit ActionChecked(
            actionCheckId,
            agentId,
            policyId,
            target,
            value,
            calldataHash,
            selector,
            simulationHash,
            decision,
            reasonCode,
            check.timestamp
        );

        agentRegistry.updateReputation(agentId, uint8(decision), uint8(reasonCode));
    }

    function getActionCheck(uint256 actionCheckId) external view returns (ActionCheck memory) {
        return actionChecks[actionCheckId];
    }

    function _isDecisionReasonPairValid(
        Decision decision,
        ReasonCode reasonCode
    ) private pure returns (bool) {
        if (decision == Decision.ALLOW) {
            return reasonCode == ReasonCode.POLICY_PASSED;
        }
        if (reasonCode == ReasonCode.POLICY_PASSED) {
            return false;
        }
        return true;
    }
}
