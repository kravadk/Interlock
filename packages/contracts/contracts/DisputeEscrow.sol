// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title DisputeEscrow
/// @notice Economic teeth for the Interlock dispute window. A recorder backs a recorded action's
///   honesty with a bond; a challenger backs a dispute with a bond; an authorized arbiter resolves,
///   and **the winner takes the loser's bond** (slashing). Keyed by `actionCheckId` and decoupled
///   from ActionAttestationV2 (referenced by id only — no integration, no redeploy of V2).
///
/// Pull-payment model: resolution credits an internal `withdrawable` balance; funds are claimed via
/// `withdraw()` (checks-effects-interactions + reentrancy lock) — no value is ever pushed on resolve.
contract DisputeEscrow {
    enum Status {
        NONE,
        BONDED,
        DISPUTED,
        RESOLVED
    }

    struct Dispute {
        Status status;
        address recorder;
        uint256 recorderBond;
        address challenger;
        uint256 challengerBond;
        uint256 bondedAt;
    }

    uint256 public constant DISPUTE_WINDOW = 2 hours;

    address public immutable owner;
    address public arbiter;

    mapping(uint256 => Dispute) private disputes; // actionCheckId => dispute
    mapping(address => uint256) public withdrawable;

    bool private _locked;

    event RecordBonded(uint256 indexed actionCheckId, address indexed recorder, uint256 bond);
    event DisputeOpened(uint256 indexed actionCheckId, address indexed challenger, uint256 bond);
    event DisputeResolved(uint256 indexed actionCheckId, bool challengerWins, address indexed winner, uint256 payout);
    event RecordBondReclaimed(uint256 indexed actionCheckId, address indexed recorder, uint256 bond);
    event Withdrawn(address indexed account, uint256 amount);
    event ArbiterUpdated(address indexed arbiter);

    error ZeroAddress();
    error ZeroBond();
    error AlreadyBonded();
    error NotBonded();
    error SelfDispute();
    error WindowClosed();
    error WindowOpen();
    error InsufficientBond();
    error NotDisputed();
    error NotArbiter();
    error NotOwner();
    error NothingToWithdraw();
    error Reentrancy();
    error TransferFailed();

    constructor(address arbiterAddress) {
        if (arbiterAddress == address(0)) revert ZeroAddress();
        owner = msg.sender;
        arbiter = arbiterAddress;
    }

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    /// @notice Set the arbiter who resolves disputes. Owner-only.
    /// @param newArbiter The new arbiter address (non-zero).
    function setArbiter(address newArbiter) external {
        if (msg.sender != owner) revert NotOwner();
        if (newArbiter == address(0)) revert ZeroAddress();
        arbiter = newArbiter;
        emit ArbiterUpdated(newArbiter);
    }

    /// @notice Recorder posts a bond backing the honesty of a recorded action.
    function bondRecord(uint256 actionCheckId) external payable {
        if (msg.value == 0) revert ZeroBond();
        Dispute storage d = disputes[actionCheckId];
        if (d.status != Status.NONE) revert AlreadyBonded();
        d.status = Status.BONDED;
        d.recorder = msg.sender;
        d.recorderBond = msg.value;
        d.bondedAt = block.timestamp;
        emit RecordBonded(actionCheckId, msg.sender, msg.value);
    }

    /// @notice Challenger posts a bond (>= the recorder's) to dispute the record within the window.
    function openDispute(uint256 actionCheckId) external payable {
        Dispute storage d = disputes[actionCheckId];
        if (d.status != Status.BONDED) revert NotBonded();
        if (msg.sender == d.recorder) revert SelfDispute();
        if (block.timestamp >= d.bondedAt + DISPUTE_WINDOW) revert WindowClosed();
        if (msg.value < d.recorderBond) revert InsufficientBond();
        d.status = Status.DISPUTED;
        d.challenger = msg.sender;
        d.challengerBond = msg.value;
        emit DisputeOpened(actionCheckId, msg.sender, msg.value);
    }

    /// @notice Arbiter resolves a dispute; the winner is credited both bonds (loser slashed).
    function resolve(uint256 actionCheckId, bool challengerWins) external {
        if (msg.sender != arbiter) revert NotArbiter();
        Dispute storage d = disputes[actionCheckId];
        if (d.status != Status.DISPUTED) revert NotDisputed();
        d.status = Status.RESOLVED;

        uint256 pot = d.recorderBond + d.challengerBond;
        address winner = challengerWins ? d.challenger : d.recorder;
        withdrawable[winner] += pot;
        emit DisputeResolved(actionCheckId, challengerWins, winner, pot);
    }

    /// @notice Recorder reclaims their bond if the window passed with no dispute.
    function reclaimRecordBond(uint256 actionCheckId) external {
        Dispute storage d = disputes[actionCheckId];
        if (d.status != Status.BONDED) revert NotBonded();
        if (block.timestamp < d.bondedAt + DISPUTE_WINDOW) revert WindowOpen();
        d.status = Status.RESOLVED;
        withdrawable[d.recorder] += d.recorderBond;
        emit RecordBondReclaimed(actionCheckId, d.recorder, d.recorderBond);
    }

    /// @notice Pull credited funds (pot winnings or reclaimed bonds).
    function withdraw() external nonReentrant {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Read the dispute state (status, bonds, parties) for an attestation id.
    /// @param actionCheckId The attestation id the dispute is keyed by.
    /// @return The stored Dispute record.
    function getDispute(uint256 actionCheckId) external view returns (Dispute memory) {
        return disputes[actionCheckId];
    }
}
