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

interface IAttestorCommittee {
    function isApproved(bytes32 digest, bytes[] calldata signatures) external view returns (bool);
    function isMember(address account) external view returns (bool);
}

/// @title ActionAttestationV4
/// @notice V3 + decentralized attestation: a recorded decision is now verified against an
///   `AttestorCommittee` (m-of-n) instead of a single attestor. `recordAction` recovers the EIP-712
///   digest and requires `committee.isApproved(digest, signatures)` — at least `threshold` DISTINCT
///   committee members must have signed. Everything else (evidenceHash commitment, per-agent nonce
///   replay guard, deadline, 2h dispute window, challenge/finalize, AgentRegistry reputation, and the
///   append-only `ActionChecked` event) is identical to V3, so existing indexer parsers keep working.
contract ActionAttestationV4 {
    enum Decision {
        ALLOW,
        BLOCK,
        REVIEW
    }

    // Order MUST match @interlock/shared ReasonCode.
    enum ReasonCode {
        POLICY_PASSED,
        TARGET_NOT_ALLOWED,
        VALUE_LIMIT_EXCEEDED,
        SLIPPAGE_LIMIT_EXCEEDED,
        SIMULATION_FAILED,
        UNKNOWN_SELECTOR,
        RWA_OVEREXPOSURE,
        CONCENTRATION_RISK,
        DAILY_REBALANCE_EXCEEDED,
        STALE_POLICY,
        WRONG_CHAIN
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
        bytes32 evidenceHash;
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
    IAttestorCommittee public committee;

    // EIP-712
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant ACTION_TYPEHASH =
        keccak256(
            "Action(uint256 agentId,uint256 policyId,address target,uint256 value,bytes32 calldataHash,bytes4 selector,bytes32 simulationHash,bytes32 evidenceHash,uint8 decision,uint8 reasonCode,uint256 nonce,uint256 deadline)"
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
        uint256 finalizableAt,
        bytes32 evidenceHash
    );
    event ActionChallenged(uint256 indexed actionCheckId, address indexed challenger, string reason);
    event ActionFinalized(uint256 indexed actionCheckId);
    event CommitteeUpdated(address indexed committee);

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
    error NotAuthorizedToChallenge();

    constructor(address agentRegistryAddress, address policyRegistryAddress, address committeeAddress) {
        if (committeeAddress == address(0)) revert ZeroAddress();
        agentRegistry = IAgentRegistryForAttestation(agentRegistryAddress);
        policyRegistry = IPolicyRegistryForAttestation(policyRegistryAddress);
        contractOwner = msg.sender;
        committee = IAttestorCommittee(committeeAddress);

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("AgentOps")),
                keccak256(bytes("4")),
                block.chainid,
                address(this)
            )
        );
    }

    modifier onlyContractOwner() {
        if (msg.sender != contractOwner) revert NotContractOwner();
        _;
    }

    /// @notice Set the AttestorCommittee that `recordAction` verifies signatures against. Owner-only.
    /// @param newCommittee The new committee address (non-zero).
    function setCommittee(address newCommittee) external onlyContractOwner {
        if (newCommittee == address(0)) revert ZeroAddress();
        committee = IAttestorCommittee(newCommittee);
        emit CommitteeUpdated(newCommittee);
    }

    /// @notice Record a committee-signed ALLOW/BLOCK decision, opening a dispute window and updating
    ///         AgentRegistry reputation. Requires >= threshold distinct committee signatures over the
    ///         EIP-712 digest.
    /// @param agentId Agent the action belongs to.
    /// @param policyId Policy evaluated for the action.
    /// @param target Call target of the proposed action.
    /// @param value Native value of the proposed action.
    /// @param calldataHash keccak256 of the proposed calldata.
    /// @param selector 4-byte function selector of the proposed calldata.
    /// @param simulationHash keccak256 commitment to the off-chain simulation result.
    /// @param evidenceHash keccak256 commitment to the full off-chain evidence object.
    /// @param decision The recorded ALLOW/BLOCK decision.
    /// @param reasonCode The machine-readable reason for the decision.
    /// @param deadline Unix time after which the signatures are rejected (replay/staleness guard).
    /// @param signatures >= threshold distinct committee-member EIP-712 signatures over the digest.
    function recordAction(
        uint256 agentId,
        uint256 policyId,
        address target,
        uint256 value,
        bytes32 calldataHash,
        bytes4 selector,
        bytes32 simulationHash,
        bytes32 evidenceHash,
        Decision decision,
        ReasonCode reasonCode,
        uint256 deadline,
        bytes[] calldata signatures
    ) external returns (uint256 actionCheckId) {
        if (policyRegistry.ownerOf(policyId) != msg.sender) revert PolicyOwnerOnly();
        if (target == address(0)) revert EmptyTarget();
        if (!_isDecisionReasonPairValid(decision, reasonCode)) revert InvalidDecisionReason();
        if (block.timestamp > deadline) revert SignatureExpired();

        // Verify >= threshold distinct committee members signed (replay-guarded by per-agent nonce).
        _verifyAttestation(
            _AttestationInput({
                agentId: agentId,
                policyId: policyId,
                target: target,
                value: value,
                calldataHash: calldataHash,
                selector: selector,
                simulationHash: simulationHash,
                evidenceHash: evidenceHash,
                decision: uint8(decision),
                reasonCode: uint8(reasonCode),
                deadline: deadline
            }),
            signatures
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
            evidenceHash: evidenceHash,
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
            finalizableAt,
            evidenceHash
        );

        agentRegistry.updateReputation(agentId, uint8(decision), uint8(reasonCode));
    }

    /// @notice Flag a recorded action as disputed while still inside its window. Callable by the agent
    ///         owner, the policy owner, or any committee member.
    function challenge(uint256 actionCheckId, string calldata reason) external {
        ActionCheck storage check = actionChecks[actionCheckId];
        if (check.timestamp == 0) revert ActionNotFound();
        if (check.status != Status.ACTIVE) revert NotChallengeable();
        if (block.timestamp >= check.finalizableAt) revert WindowClosed();

        address agentOwner = agentRegistry.ownerOf(check.agentId);
        address policyOwner = policyRegistry.ownerOf(check.policyId);
        if (msg.sender != agentOwner && msg.sender != policyOwner && !committee.isMember(msg.sender)) {
            revert NotAuthorizedToChallenge();
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

    /// @notice Read a recorded attestation by id (decision, status, dispute window, evidence hash).
    /// @param actionCheckId The attestation id returned by `recordAction`.
    /// @return The stored ActionCheck record.
    function getActionCheck(uint256 actionCheckId) external view returns (ActionCheck memory) {
        return actionChecks[actionCheckId];
    }

    struct _AttestationInput {
        uint256 agentId;
        uint256 policyId;
        address target;
        uint256 value;
        bytes32 calldataHash;
        bytes4 selector;
        bytes32 simulationHash;
        bytes32 evidenceHash;
        uint8 decision;
        uint8 reasonCode;
        uint256 deadline;
    }

    /// @dev Builds the EIP-712 digest and requires the committee to approve it (>= threshold members).
    function _verifyAttestation(_AttestationInput memory input, bytes[] calldata signatures) private view {
        bytes32 structHash = keccak256(
            abi.encode(
                ACTION_TYPEHASH,
                input.agentId,
                input.policyId,
                input.target,
                input.value,
                input.calldataHash,
                input.selector,
                input.simulationHash,
                input.evidenceHash,
                input.decision,
                input.reasonCode,
                nonces[input.agentId],
                input.deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        if (!committee.isApproved(digest, signatures)) revert BadAttestorSignature();
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
