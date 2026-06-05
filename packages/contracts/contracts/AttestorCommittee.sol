// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title AttestorCommittee
/// @notice Decentralized attestation primitive: an m-of-n committee of attestors. `isApproved`
///   verifies that at least `threshold` DISTINCT committee members signed a digest. A reusable
///   building block — a future ActionAttestation V3 or the DisputeEscrow arbiter can require
///   `isApproved(...)` instead of trusting a single signer. Additive + standalone (it does not
///   touch the live single-attestor V2).
contract AttestorCommittee {
    address public immutable owner;
    uint256 public threshold;

    mapping(address => bool) public isMember;
    address[] private memberList;

    event AttestorAdded(address indexed attestor);
    event AttestorRemoved(address indexed attestor);
    event ThresholdUpdated(uint256 threshold);

    error NotOwner();
    error ZeroAddress();
    error AlreadyMember();
    error NotMember();
    error BadThreshold();
    error EmptyCommittee();

    constructor(address[] memory attestors, uint256 thresholdValue) {
        if (attestors.length == 0) revert EmptyCommittee();
        owner = msg.sender;
        for (uint256 i = 0; i < attestors.length; i++) {
            address a = attestors[i];
            if (a == address(0)) revert ZeroAddress();
            if (isMember[a]) revert AlreadyMember();
            isMember[a] = true;
            memberList.push(a);
        }
        if (thresholdValue == 0 || thresholdValue > memberList.length) revert BadThreshold();
        threshold = thresholdValue;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice True if at least `threshold` distinct committee members signed `digest`.
    /// @dev `signatures` must be 65-byte ECDSA signatures over `digest` (the caller builds the
    /// EIP-712 digest). Duplicate or non-member signers do not count toward the threshold.
    function isApproved(bytes32 digest, bytes[] calldata signatures) external view returns (bool) {
        uint256 valid = 0;
        address[] memory seen = new address[](signatures.length);
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = _recover(digest, signatures[i]);
            if (signer == address(0) || !isMember[signer]) continue;
            bool dup = false;
            for (uint256 j = 0; j < valid; j++) {
                if (seen[j] == signer) {
                    dup = true;
                    break;
                }
            }
            if (dup) continue;
            seen[valid] = signer;
            valid++;
            if (valid >= threshold) return true;
        }
        return false;
    }

    function memberCount() external view returns (uint256) {
        return memberList.length;
    }

    function members() external view returns (address[] memory) {
        return memberList;
    }

    function addAttestor(address attestor) external onlyOwner {
        if (attestor == address(0)) revert ZeroAddress();
        if (isMember[attestor]) revert AlreadyMember();
        isMember[attestor] = true;
        memberList.push(attestor);
        emit AttestorAdded(attestor);
    }

    function removeAttestor(address attestor) external onlyOwner {
        if (!isMember[attestor]) revert NotMember();
        if (memberList.length - 1 < threshold) revert BadThreshold();
        isMember[attestor] = false;
        uint256 length = memberList.length;
        uint256 index = length;
        for (uint256 i = 0; i < length; i++) {
            if (memberList[i] == attestor) {
                index = i;
                break;
            }
        }
        memberList[index] = memberList[length - 1];
        memberList.pop();
        emit AttestorRemoved(attestor);
    }

    function setThreshold(uint256 thresholdValue) external onlyOwner {
        if (thresholdValue == 0 || thresholdValue > memberList.length) revert BadThreshold();
        threshold = thresholdValue;
        emit ThresholdUpdated(thresholdValue);
    }

    /// @dev Minimal anti-malleable ECDSA recover (65-byte sig), mirrors ActionAttestationV2.
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
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        return ecrecover(digest, v, r, s);
    }
}
