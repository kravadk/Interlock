// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IAgentRegistry {
    function ownerOf(uint256 agentId) external view returns (address);
}

contract PolicyRegistry {
    string public constant VERSION = "1.2.0";
    uint16 public constant MAX_SLIPPAGE_BPS = 10000;

    struct Policy {
        address owner;
        uint256 agentId;
        uint256 maxNativeValue;
        uint16 maxSlippageBps;
        bool active;
    }

    uint256 public nextPolicyId = 1;
    IAgentRegistry public immutable agentRegistry;

    mapping(uint256 => Policy) private policies;
    mapping(uint256 => mapping(address => bool)) public allowedTargets;
    mapping(uint256 => mapping(bytes4 => bool)) public allowedSelectors;
    mapping(uint256 => address[]) private policyTargets;
    mapping(uint256 => bytes4[]) private policySelectors;
    mapping(uint256 => mapping(address => uint256)) private targetIndexes;
    mapping(uint256 => mapping(bytes4 => uint256)) private selectorIndexes;

    event PolicyCreated(
        uint256 indexed policyId,
        uint256 indexed agentId,
        address indexed owner,
        uint256 maxNativeValue,
        uint16 maxSlippageBps
    );
    event PolicyUpdated(uint256 indexed policyId, uint256 maxNativeValue, uint16 maxSlippageBps, bool active);
    event TargetPermissionUpdated(uint256 indexed policyId, address indexed target, bool allowed);
    event SelectorPermissionUpdated(uint256 indexed policyId, bytes4 indexed selector, bool allowed);

    error NotPolicyOwner();
    error AgentOwnerOnly();
    error PolicyNotFound();
    error EmptyTarget();
    error InvalidSlippageBps();

    constructor(address agentRegistryAddress) {
        agentRegistry = IAgentRegistry(agentRegistryAddress);
    }

    modifier onlyPolicyOwner(uint256 policyId) {
        if (policies[policyId].owner == address(0)) revert PolicyNotFound();
        if (policies[policyId].owner != msg.sender) revert NotPolicyOwner();
        _;
    }

    function createPolicy(
        uint256 agentId,
        uint256 maxNativeValue,
        uint16 maxSlippageBps,
        address[] calldata targets,
        bytes4[] calldata selectors
    ) external returns (uint256 policyId) {
        if (agentRegistry.ownerOf(agentId) != msg.sender) revert AgentOwnerOnly();
        if (maxSlippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippageBps();

        policyId = nextPolicyId++;
        policies[policyId] = Policy({
            owner: msg.sender,
            agentId: agentId,
            maxNativeValue: maxNativeValue,
            maxSlippageBps: maxSlippageBps,
            active: true
        });

        for (uint256 i = 0; i < targets.length; i++) {
            _setTargetAllowed(policyId, targets[i], true);
        }

        for (uint256 i = 0; i < selectors.length; i++) {
            _setSelectorAllowed(policyId, selectors[i], true);
        }

        emit PolicyCreated(policyId, agentId, msg.sender, maxNativeValue, maxSlippageBps);
    }

    function updatePolicy(
        uint256 policyId,
        uint256 maxNativeValue,
        uint16 maxSlippageBps,
        bool active
    ) external onlyPolicyOwner(policyId) {
        if (maxSlippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippageBps();

        Policy storage policy = policies[policyId];
        policy.maxNativeValue = maxNativeValue;
        policy.maxSlippageBps = maxSlippageBps;
        policy.active = active;
        emit PolicyUpdated(policyId, maxNativeValue, maxSlippageBps, active);
    }

    function setTargetAllowed(uint256 policyId, address target, bool allowed) external onlyPolicyOwner(policyId) {
        _setTargetAllowed(policyId, target, allowed);
    }

    function setSelectorAllowed(uint256 policyId, bytes4 selector, bool allowed) external onlyPolicyOwner(policyId) {
        _setSelectorAllowed(policyId, selector, allowed);
    }

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        if (policies[policyId].owner == address(0)) revert PolicyNotFound();
        return policies[policyId];
    }

    function ownerOf(uint256 policyId) external view returns (address) {
        if (policies[policyId].owner == address(0)) revert PolicyNotFound();
        return policies[policyId].owner;
    }

    function isTargetAllowed(uint256 policyId, address target) external view returns (bool) {
        return allowedTargets[policyId][target];
    }

    function isSelectorAllowed(uint256 policyId, bytes4 selector) external view returns (bool) {
        return allowedSelectors[policyId][selector];
    }

    function getAllowedTargets(uint256 policyId) external view returns (address[] memory) {
        if (policies[policyId].owner == address(0)) revert PolicyNotFound();
        return policyTargets[policyId];
    }

    function getAllowedSelectors(uint256 policyId) external view returns (bytes4[] memory) {
        if (policies[policyId].owner == address(0)) revert PolicyNotFound();
        return policySelectors[policyId];
    }

    function supportsPolicyEnumeration() external pure returns (bool) {
        return true;
    }

    function _setTargetAllowed(uint256 policyId, address target, bool allowed) internal {
        if (target == address(0)) revert EmptyTarget();
        if (allowedTargets[policyId][target] == allowed) return;

        allowedTargets[policyId][target] = allowed;

        if (allowed) {
            policyTargets[policyId].push(target);
            targetIndexes[policyId][target] = policyTargets[policyId].length;
        } else {
            uint256 indexPlusOne = targetIndexes[policyId][target];
            if (indexPlusOne != 0) {
                uint256 index = indexPlusOne - 1;
                uint256 lastIndex = policyTargets[policyId].length - 1;
                if (index != lastIndex) {
                    address lastTarget = policyTargets[policyId][lastIndex];
                    policyTargets[policyId][index] = lastTarget;
                    targetIndexes[policyId][lastTarget] = index + 1;
                }
                policyTargets[policyId].pop();
                delete targetIndexes[policyId][target];
            }
        }

        emit TargetPermissionUpdated(policyId, target, allowed);
    }

    function _setSelectorAllowed(uint256 policyId, bytes4 selector, bool allowed) internal {
        if (allowedSelectors[policyId][selector] == allowed) return;

        allowedSelectors[policyId][selector] = allowed;

        if (allowed) {
            policySelectors[policyId].push(selector);
            selectorIndexes[policyId][selector] = policySelectors[policyId].length;
        } else {
            uint256 indexPlusOne = selectorIndexes[policyId][selector];
            if (indexPlusOne != 0) {
                uint256 index = indexPlusOne - 1;
                uint256 lastIndex = policySelectors[policyId].length - 1;
                if (index != lastIndex) {
                    bytes4 lastSelector = policySelectors[policyId][lastIndex];
                    policySelectors[policyId][index] = lastSelector;
                    selectorIndexes[policyId][lastSelector] = index + 1;
                }
                policySelectors[policyId].pop();
                delete selectorIndexes[policyId][selector];
            }
        }

        emit SelectorPermissionUpdated(policyId, selector, allowed);
    }
}
