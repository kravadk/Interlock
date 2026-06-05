// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IAgentRegistryForAttestation {
    function updateReputation(uint256 agentId, uint8 decision, uint8 reasonCode) external;
    function ownerOf(uint256 agentId) external view returns (address);
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

/// @title ActionAttestationV2
/// @notice Records pre-flight decisions with two added guarantees over V1:
///   1. Each decision must be signed (EIP-712) by an authorized off-chain attestor,
///      so a recorded ALLOW/BLOCK is provably the evaluated decision, not arbitrary.
///   2. Each record carries a dispute window: it is ACTIVE until `finalizableAt`,
///      can be CHALLENGED within the window, and FINALIZED after it.
/// Reputation is still updated immediately on record (so existing readers keep working);
/// the event appends `status` + `finalizableAt` after the original fields for back-compat.
contract ActionAttestationV2 {
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

    enum Status {
        ACTIVE,
        CHALLENGED,
        FINALIZED
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
        Status status;
        uint256 finalizableAt;
    }

    uint256 public constant DISPUTE_WINDOW = 2 hours;

    uint256 public nextActionCheckId = 1;
    IAgentRegistryForAttestation public immutable agentRegistry;
    IPolicyRegistryForAttestation public immutable policyRegistry;

    address public immutable contractOwner;
    address public attestor;

    // EIP-712
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant ACTION_TYPEHASH =
        keccak256(
            "Action(uint256 agentId,uint256 policyId,address target,uint256 value,bytes32 calldataHash,bytes4 selector,bytes32 simulationHash,uint8 decision,uint8 reasonCode,uint256 nonce,uint256 deadline)"
        );

    mapping(uint256 => ActionCheck) private actionChecks;
    mapping(uint256 => uint256) public nonces; // per-agent replay guard

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
        uint256 timestamp,
        Status status,
        uint256 finalizableAt
    );
    event ActionChallenged(uint256 indexed actionCheckId, address indexed challenger, string reason);
    event ActionFinalized(uint256 indexed actionCheckId);
    event AttestorUpdated(address indexed attestor);

    error PolicyOwnerOnly();
    error PolicyAgentMismatch();
    error InactivePolicy();
    error AllowedActionTargetNotAllowed();
    error AllowedActionSelectorNotAllowed();
    error AllowedActionValueLimitExceeded();
    error EmptyTarget();
    error InvalidDecisionReason();
    error BadAttestorSignature();
    error SignatureExpired();
    error NotContractOwner();
    error ZeroAddress();
    error ActionNotFound();
    error WindowClosed();
    error WindowOpen();
    error NotChallengeable();
    error AlreadyFinalized();

    constructor(address agentRegistryAddress, address policyRegistryAddress, address attestorAddress) {
        if (attestorAddress == address(0)) revert ZeroAddress();
        agentRegistry = IAgentRegistryForAttestation(agentRegistryAddress);
        policyRegistry = IPolicyRegistryForAttestation(policyRegistryAddress);
        contractOwner = msg.sender;
        attestor = attestorAddress;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("AgentOps")),
                keccak256(bytes("2")),
                block.chainid,
                address(this)
            )
        );
    }

    modifier onlyContractOwner() {
        if (msg.sender != contractOwner) revert NotContractOwner();
        _;
    }

    function setAttestor(address newAttestor) external onlyContractOwner {
        if (newAttestor == address(0)) revert ZeroAddress();
        attestor = newAttestor;
        emit AttestorUpdated(newAttestor);
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
        ReasonCode reasonCode,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 actionCheckId) {
        if (policyRegistry.ownerOf(policyId) != msg.sender) revert PolicyOwnerOnly();
        if (target == address(0)) revert EmptyTarget();
        if (!_isDecisionReasonPairValid(decision, reasonCode)) revert InvalidDecisionReason();
        if (block.timestamp > deadline) revert SignatureExpired();

        // Verify the decision was signed by the authorized attestor (replay-guarded by nonce).
        // Done in a helper to keep recordAction's stack shallow (avoids "stack too deep").
        _verifyAttestation(
            agentId,
            policyId,
            target,
            value,
            calldataHash,
            selector,
            simulationHash,
            uint8(decision),
            uint8(reasonCode),
            deadline,
            signature
        );
        nonces[agentId] += 1;

        IPolicyRegistryForAttestation.Policy memory policy = policyRegistry.getPolicy(policyId);
        if (!policy.active) revert InactivePolicy();
        if (policy.agentId != agentId) revert PolicyAgentMismatch();
        if (decision == Decision.ALLOW) {
            if (!policyRegistry.isTargetAllowed(policyId, target)) revert AllowedActionTargetNotAllowed();
            if (!policyRegistry.isSelectorAllowed(policyId, selector)) revert AllowedActionSelectorNotAllowed();
            if (value > policy.maxNativeValue) revert AllowedActionValueLimitExceeded();
        }

        actionCheckId = nextActionCheckId++;
        uint256 finalizableAt = block.timestamp + DISPUTE_WINDOW;
        actionChecks[actionCheckId] = ActionCheck({
            agentId: agentId,
            policyId: policyId,
            target: target,
            value: value,
            calldataHash: calldataHash,
            selector: selector,
            simulationHash: simulationHash,
            decision: decision,
            reasonCode: reasonCode,
            timestamp: block.timestamp,
            status: Status.ACTIVE,
            finalizableAt: finalizableAt
        });

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
            block.timestamp,
            Status.ACTIVE,
            finalizableAt
        );

        agentRegistry.updateReputation(agentId, uint8(decision), uint8(reasonCode));
    }

    /// @notice Flag a recorded action as disputed while still inside its window.
    /// Callable by the agent owner, the policy owner, or the attestor.
    function challenge(uint256 actionCheckId, string calldata reason) external {
        ActionCheck storage check = actionChecks[actionCheckId];
        if (check.timestamp == 0) revert ActionNotFound();
        if (check.status != Status.ACTIVE) revert NotChallengeable();
        if (block.timestamp >= check.finalizableAt) revert WindowClosed();

        address agentOwner = agentRegistry.ownerOf(check.agentId);
        address policyOwner = policyRegistry.ownerOf(check.policyId);
        if (msg.sender != agentOwner && msg.sender != policyOwner && msg.sender != attestor) {
            revert PolicyOwnerOnly();
        }

        check.status = Status.CHALLENGED;
        emit ActionChallenged(actionCheckId, msg.sender, reason);
    }

    /// @notice Stamp a record FINALIZED after its window closes (and it was not challenged).
    function finalize(uint256 actionCheckId) external {
        ActionCheck storage check = actionChecks[actionCheckId];
        if (check.timestamp == 0) revert ActionNotFound();
        if (check.status == Status.FINALIZED) revert AlreadyFinalized();
        if (check.status == Status.CHALLENGED) revert NotChallengeable();
        if (block.timestamp < check.finalizableAt) revert WindowOpen();

        check.status = Status.FINALIZED;
        emit ActionFinalized(actionCheckId);
    }

    function getActionCheck(uint256 actionCheckId) external view returns (ActionCheck memory) {
        return actionChecks[actionCheckId];
    }

    /// @dev Recovers the EIP-712 signer for the action and requires it to be the attestor.
    /// Isolated from recordAction so the heavy abi.encode stays off that function's stack.
    function _verifyAttestation(
        uint256 agentId,
        uint256 policyId,
        address target,
        uint256 value,
        bytes32 calldataHash,
        bytes4 selector,
        bytes32 simulationHash,
        uint8 decision,
        uint8 reasonCode,
        uint256 deadline,
        bytes calldata signature
    ) private view {
        bytes32 structHash = keccak256(
            abi.encode(
                ACTION_TYPEHASH,
                agentId,
                policyId,
                target,
                value,
                calldataHash,
                selector,
                simulationHash,
                decision,
                reasonCode,
                nonces[agentId],
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        if (_recover(digest, signature) != attestor) revert BadAttestorSignature();
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

    /// @dev Minimal ECDSA recover (65-byte signature), dependency-free.
    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        // reject malleable high-s
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        return ecrecover(digest, v, r, s);
    }
}
