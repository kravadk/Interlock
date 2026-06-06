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

    /// @notice Create a policy for an agent the caller owns, seeding target + selector allowlists.
    /// @param agentId The agent this policy governs (caller must own it).
    /// @param maxNativeValue Max native value an allowed action may carry.
    /// @param maxSlippageBps Max slippage (basis points, <= MAX_SLIPPAGE_BPS) advisory limit.
    /// @param targets Initial allowlisted call targets.
    /// @param selectors Initial allowlisted 4-byte selectors.
    /// @return policyId The newly assigned policy id.
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

    /// @notice Update a policy's limits and active state. Policy owner only.
    /// @param policyId The policy to update.
    /// @param maxNativeValue New max native value for allowed actions.
    /// @param maxSlippageBps New slippage limit (basis points, <= MAX_SLIPPAGE_BPS).
    /// @param active Whether the policy is active (inactive policies block all actions).
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

    /// @notice Add or remove a call target from a policy's allowlist. Policy owner only.
    /// @param policyId The policy to modify.
    /// @param target The call target address.
    /// @param allowed True to allow, false to remove.
    function setTargetAllowed(uint256 policyId, address target, bool allowed) external onlyPolicyOwner(policyId) {
        _setTargetAllowed(policyId, target, allowed);
    }

    /// @notice Add or remove a 4-byte selector from a policy's allowlist. Policy owner only.
    /// @param policyId The policy to modify.
    /// @param selector The function selector.
    /// @param allowed True to allow, false to remove.
    function setSelectorAllowed(uint256 policyId, bytes4 selector, bool allowed) external onlyPolicyOwner(policyId) {
        _setSelectorAllowed(policyId, selector, allowed);
    }

    /// @notice Full policy record (owner, agent, limits, active). Reverts if not found.
    /// @param policyId The policy id to read.
    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        if (policies[policyId].owner == address(0)) revert PolicyNotFound();
        return policies[policyId];
    }

    /// @notice The owner address of a policy. Reverts if not found.
    /// @param policyId The policy id to look up.
    function ownerOf(uint256 policyId) external view returns (address) {
        if (policies[policyId].owner == address(0)) revert PolicyNotFound();
        return policies[policyId].owner;
    }

    /// @notice Whether a target is on the policy's allowlist.
    /// @param policyId The policy id.
    /// @param target The call target to check.
    function isTargetAllowed(uint256 policyId, address target) external view returns (bool) {
        return allowedTargets[policyId][target];
    }

    /// @notice Whether a selector is on the policy's allowlist.
    /// @param policyId The policy id.
    /// @param selector The 4-byte selector to check.
    function isSelectorAllowed(uint256 policyId, bytes4 selector) external view returns (bool) {
        return allowedSelectors[policyId][selector];
    }

    /// @notice Enumerate a policy's allowlisted targets. Reverts if not found.
    /// @param policyId The policy id.
    function getAllowedTargets(uint256 policyId) external view returns (address[] memory) {
        if (policies[policyId].owner == address(0)) revert PolicyNotFound();
        return policyTargets[policyId];
    }

    /// @notice Enumerate a policy's allowlisted selectors. Reverts if not found.
    /// @param policyId The policy id.
    function getAllowedSelectors(uint256 policyId) external view returns (bytes4[] memory) {
        if (policies[policyId].owner == address(0)) revert PolicyNotFound();
        return policySelectors[policyId];
    }

    /// @notice Capability flag: this PolicyRegistry supports target/selector enumeration.
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
