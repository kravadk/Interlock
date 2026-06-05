// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IPolicyRegistryForGuard {
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

/// @title PolicyGuardedExecutor
/// @notice On-chain enforcement for Interlock. An agent routes execution THROUGH this contract:
///   funds + calldata flow into `execute`, which validates the call against the on-chain
///   PolicyRegistry (active, agent match, target/selector allowlist, value limit) and **reverts a
///   disallowed action before it runs**, forwarding only allowed actions. This turns the firewall
///   from advisory (decisions merely recorded) into enforcing.
///
/// The check is intentionally cheap (allowlist + value, no simulation/LLM — those stay off-chain for
/// the advisory path). `ActionEnforced` is the executor's own on-chain evidence; it does NOT record
/// to ActionAttestationV2 (that needs the off-chain attestor's EIP-712 signature) — the two are
/// decoupled by design.
contract PolicyGuardedExecutor {
    // Mirrors ActionAttestationV2.ReasonCode so previewExecute returns the same codes.
    enum ReasonCode {
        POLICY_PASSED,
        TARGET_NOT_ALLOWED,
        VALUE_LIMIT_EXCEEDED,
        SLIPPAGE_LIMIT_EXCEEDED,
        SIMULATION_FAILED,
        UNKNOWN_SELECTOR
    }

    IPolicyRegistryForGuard public immutable policyRegistry;

    bool private _locked;

    event ActionEnforced(
        uint256 indexed agentId,
        uint256 indexed policyId,
        address indexed target,
        uint256 value,
        bytes4 selector,
        address caller
    );

    error NotPolicyOwner();
    error ValueMismatch();
    error InactivePolicy();
    error PolicyAgentMismatch();
    error TargetNotAllowed();
    error SelectorNotAllowed();
    error ValueLimitExceeded();
    error ExecutionFailed(bytes returnData);
    error Reentrancy();
    error ZeroAddress();

    constructor(address policyRegistryAddress) {
        if (policyRegistryAddress == address(0)) revert ZeroAddress();
        policyRegistry = IPolicyRegistryForGuard(policyRegistryAddress);
    }

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    /// @notice Validate `data`/`value` against the policy on-chain and, if allowed, forward the call
    /// to `target` with the attached `value`. Reverts (does not execute) any disallowed action.
    /// @dev Caller must be the policy owner; `msg.value` must equal `value` (funds flow through).
    function execute(
        uint256 agentId,
        uint256 policyId,
        address target,
        uint256 value,
        bytes calldata data
    ) external payable nonReentrant returns (bytes memory) {
        if (msg.sender != policyRegistry.ownerOf(policyId)) revert NotPolicyOwner();
        if (msg.value != value) revert ValueMismatch();

        IPolicyRegistryForGuard.Policy memory policy = policyRegistry.getPolicy(policyId);
        if (!policy.active) revert InactivePolicy();
        if (policy.agentId != agentId) revert PolicyAgentMismatch();
        if (!policyRegistry.isTargetAllowed(policyId, target)) revert TargetNotAllowed();

        bytes4 selector = _selectorOf(data);
        if (data.length >= 4 && !policyRegistry.isSelectorAllowed(policyId, selector)) {
            revert SelectorNotAllowed();
        }
        if (value > policy.maxNativeValue) revert ValueLimitExceeded();

        // Interaction last (checks-effects-interactions + reentrancy lock).
        (bool ok, bytes memory out) = target.call{value: value}(data);
        if (!ok) revert ExecutionFailed(out);

        emit ActionEnforced(agentId, policyId, target, value, selector, msg.sender);
        return out;
    }

    /// @notice Authoritative on-chain preview: would `execute` allow this action? Does not execute.
    /// @return allowed True if all policy checks pass.
    /// @return reasonCode POLICY_PASSED when allowed, else the first failing reason.
    function previewExecute(
        uint256 agentId,
        uint256 policyId,
        address target,
        uint256 value,
        bytes calldata data
    ) external view returns (bool allowed, uint8 reasonCode) {
        IPolicyRegistryForGuard.Policy memory policy = policyRegistry.getPolicy(policyId);
        if (!policy.active || policy.agentId != agentId) {
            return (false, uint8(ReasonCode.UNKNOWN_SELECTOR));
        }
        if (!policyRegistry.isTargetAllowed(policyId, target)) {
            return (false, uint8(ReasonCode.TARGET_NOT_ALLOWED));
        }
        if (data.length >= 4 && !policyRegistry.isSelectorAllowed(policyId, _selectorOf(data))) {
            return (false, uint8(ReasonCode.UNKNOWN_SELECTOR));
        }
        if (value > policy.maxNativeValue) {
            return (false, uint8(ReasonCode.VALUE_LIMIT_EXCEEDED));
        }
        return (true, uint8(ReasonCode.POLICY_PASSED));
    }

    function _selectorOf(bytes calldata data) private pure returns (bytes4) {
        if (data.length < 4) return bytes4(0);
        return bytes4(data[:4]);
    }
}
