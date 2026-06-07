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

/// @title TokenGuardedExecutor
/// @notice On-chain enforcement that is a superset of PolicyGuardedExecutor: it runs the same
///   PolicyRegistry checks (active, agent match, target/selector allowlist, value limit) AND enforces
///   per-(policy, token) ERC-20 token rules on-chain — recipient/spender allowlists, a max amount, and
///   an unlimited-approve block. This moves the token guard from advisory (off-chain SDK) to enforced:
///   a disallowed transfer/transferFrom/approve reverts before it runs. Token rules are stored in this
///   contract and set by the policy owner. Additive + standalone (reads the live PolicyRegistry; does
///   not touch the deployed PolicyGuardedExecutor). RWA risk stays advisory off-chain by design — the
///   contract holds no portfolio/custody to evaluate exposure against.
contract TokenGuardedExecutor {
    // POLICY_PASSED..UNKNOWN_SELECTOR mirror PolicyGuardedExecutor; TOKEN_* are appended.
    enum ReasonCode {
        POLICY_PASSED,
        TARGET_NOT_ALLOWED,
        VALUE_LIMIT_EXCEEDED,
        SLIPPAGE_LIMIT_EXCEEDED,
        SIMULATION_FAILED,
        UNKNOWN_SELECTOR,
        TOKEN_RECIPIENT_NOT_ALLOWED,
        TOKEN_SPENDER_NOT_ALLOWED,
        TOKEN_AMOUNT_EXCEEDED,
        UNLIMITED_APPROVE_BLOCKED
    }

    struct TokenRule {
        bool exists;
        bool allowUnlimitedApprove;
        uint256 maxAmount; // 0 = no cap
        address[] allowedRecipients; // empty = not enforced
        address[] allowedSpenders; // empty = not enforced
    }

    // ERC-20 selectors.
    bytes4 private constant SEL_TRANSFER = 0xa9059cbb; // transfer(address,uint256)
    bytes4 private constant SEL_TRANSFER_FROM = 0x23b872dd; // transferFrom(address,address,uint256)
    bytes4 private constant SEL_APPROVE = 0x095ea7b3; // approve(address,uint256)

    IPolicyRegistryForGuard public immutable policyRegistry;

    // policyId => token => rule
    mapping(uint256 => mapping(address => TokenRule)) private tokenRules;

    bool private _locked;

    event ActionEnforced(
        uint256 indexed agentId,
        uint256 indexed policyId,
        address indexed target,
        uint256 value,
        bytes4 selector,
        address caller
    );
    event TokenRuleSet(uint256 indexed policyId, address indexed token, address indexed setter);

    error NotPolicyOwner();
    error ValueMismatch();
    error InactivePolicy();
    error PolicyAgentMismatch();
    error TargetNotAllowed();
    error SelectorNotAllowed();
    error ValueLimitExceeded();
    error TokenRecipientNotAllowed();
    error TokenSpenderNotAllowed();
    error TokenAmountExceeded();
    error UnlimitedApproveBlocked();
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

    /// @notice Set (or replace) the ERC-20 token rule for a (policy, token) pair. Policy owner only.
    /// @param policyId The policy the rule belongs to.
    /// @param token The ERC-20 token address the rule governs.
    /// @param rule The rule (set `exists=true`; empty allowlists / `maxAmount=0` mean "not enforced").
    function setTokenRule(uint256 policyId, address token, TokenRule calldata rule) external {
        if (msg.sender != policyRegistry.ownerOf(policyId)) revert NotPolicyOwner();
        if (token == address(0)) revert ZeroAddress();
        tokenRules[policyId][token] = rule;
        emit TokenRuleSet(policyId, token, msg.sender);
    }

    /// @notice Read the token rule for a (policy, token) pair.
    function getTokenRule(uint256 policyId, address token) external view returns (TokenRule memory) {
        return tokenRules[policyId][token];
    }

    /// @notice Validate `data`/`value` against the policy AND any ERC-20 token rule for `target`, then
    /// forward the call if allowed. Reverts (does not execute) any disallowed action.
    /// @dev Caller must be the policy owner; `msg.value` must equal `value`.
    function execute(
        uint256 agentId,
        uint256 policyId,
        address target,
        uint256 value,
        bytes calldata data
    ) external payable nonReentrant returns (bytes memory) {
        if (msg.sender != policyRegistry.ownerOf(policyId)) revert NotPolicyOwner();
        if (msg.value != value) revert ValueMismatch();

        uint8 code = _evaluate(agentId, policyId, target, value, data);
        if (code != uint8(ReasonCode.POLICY_PASSED)) _revertFor(code);

        bytes4 selector = _selectorOf(data);
        (bool ok, bytes memory out) = target.call{value: value}(data);
        if (!ok) revert ExecutionFailed(out);

        emit ActionEnforced(agentId, policyId, target, value, selector, msg.sender);
        return out;
    }

    /// @notice Authoritative on-chain preview: would `execute` allow this action? Does not execute.
    /// @return allowed True if all policy + token checks pass.
    /// @return reasonCode POLICY_PASSED when allowed, else the first failing reason.
    function previewExecute(
        uint256 agentId,
        uint256 policyId,
        address target,
        uint256 value,
        bytes calldata data
    ) external view returns (bool allowed, uint8 reasonCode) {
        uint8 code = _evaluate(agentId, policyId, target, value, data);
        return (code == uint8(ReasonCode.POLICY_PASSED), code);
    }

    /// @dev Returns 0 (POLICY_PASSED) when allowed, else the first failing ReasonCode.
    function _evaluate(
        uint256 agentId,
        uint256 policyId,
        address target,
        uint256 value,
        bytes calldata data
    ) private view returns (uint8) {
        IPolicyRegistryForGuard.Policy memory policy = policyRegistry.getPolicy(policyId);
        if (!policy.active || policy.agentId != agentId) {
            return uint8(ReasonCode.UNKNOWN_SELECTOR);
        }
        if (!policyRegistry.isTargetAllowed(policyId, target)) {
            return uint8(ReasonCode.TARGET_NOT_ALLOWED);
        }
        if (data.length >= 4 && !policyRegistry.isSelectorAllowed(policyId, _selectorOf(data))) {
            return uint8(ReasonCode.UNKNOWN_SELECTOR);
        }
        if (value > policy.maxNativeValue) {
            return uint8(ReasonCode.VALUE_LIMIT_EXCEEDED);
        }
        return _evaluateToken(policyId, target, data);
    }

    /// @dev Enforce the (policy, token) ERC-20 rule for transfer/transferFrom/approve. 0 = pass.
    function _evaluateToken(uint256 policyId, address token, bytes calldata data) private view returns (uint8) {
        TokenRule storage rule = tokenRules[policyId][token];
        if (!rule.exists || data.length < 4) return uint8(ReasonCode.POLICY_PASSED);

        bytes4 selector = _selectorOf(data);

        if (selector == SEL_TRANSFER && data.length >= 4 + 64) {
            (address recipient, uint256 amount) = abi.decode(data[4:], (address, uint256));
            if (!_inList(rule.allowedRecipients, recipient)) return uint8(ReasonCode.TOKEN_RECIPIENT_NOT_ALLOWED);
            if (rule.maxAmount != 0 && amount > rule.maxAmount) return uint8(ReasonCode.TOKEN_AMOUNT_EXCEEDED);
            return uint8(ReasonCode.POLICY_PASSED);
        }

        if (selector == SEL_TRANSFER_FROM && data.length >= 4 + 96) {
            (, address recipient, uint256 amount) = abi.decode(data[4:], (address, address, uint256));
            if (!_inList(rule.allowedRecipients, recipient)) return uint8(ReasonCode.TOKEN_RECIPIENT_NOT_ALLOWED);
            if (rule.maxAmount != 0 && amount > rule.maxAmount) return uint8(ReasonCode.TOKEN_AMOUNT_EXCEEDED);
            return uint8(ReasonCode.POLICY_PASSED);
        }

        if (selector == SEL_APPROVE && data.length >= 4 + 64) {
            (address spender, uint256 amount) = abi.decode(data[4:], (address, uint256));
            if (amount == type(uint256).max && !rule.allowUnlimitedApprove) {
                return uint8(ReasonCode.UNLIMITED_APPROVE_BLOCKED);
            }
            if (!_inList(rule.allowedSpenders, spender)) return uint8(ReasonCode.TOKEN_SPENDER_NOT_ALLOWED);
            if (rule.maxAmount != 0 && amount != type(uint256).max && amount > rule.maxAmount) {
                return uint8(ReasonCode.TOKEN_AMOUNT_EXCEEDED);
            }
            return uint8(ReasonCode.POLICY_PASSED);
        }

        // Not a recognized ERC-20 op — governed by the policy selector allowlist already checked above.
        return uint8(ReasonCode.POLICY_PASSED);
    }

    /// @dev True if `addr` is in `list`, OR the list is empty (empty = not enforced).
    function _inList(address[] storage list, address addr) private view returns (bool) {
        if (list.length == 0) return true;
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == addr) return true;
        }
        return false;
    }

    function _revertFor(uint8 code) private pure {
        if (code == uint8(ReasonCode.TARGET_NOT_ALLOWED)) revert TargetNotAllowed();
        if (code == uint8(ReasonCode.VALUE_LIMIT_EXCEEDED)) revert ValueLimitExceeded();
        if (code == uint8(ReasonCode.UNKNOWN_SELECTOR)) revert SelectorNotAllowed();
        if (code == uint8(ReasonCode.TOKEN_RECIPIENT_NOT_ALLOWED)) revert TokenRecipientNotAllowed();
        if (code == uint8(ReasonCode.TOKEN_SPENDER_NOT_ALLOWED)) revert TokenSpenderNotAllowed();
        if (code == uint8(ReasonCode.TOKEN_AMOUNT_EXCEEDED)) revert TokenAmountExceeded();
        if (code == uint8(ReasonCode.UNLIMITED_APPROVE_BLOCKED)) revert UnlimitedApproveBlocked();
        revert SelectorNotAllowed();
    }

    function _selectorOf(bytes calldata data) private pure returns (bytes4) {
        if (data.length < 4) return bytes4(0);
        return bytes4(data[:4]);
    }
}
