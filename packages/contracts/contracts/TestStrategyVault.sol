// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title Interlock Test Strategy Vault
/// @notice A Mantle Sepolia test contract for demonstrating guarded agent deposits.
/// @dev This is not a production vault and should not be marketed as a real yield integration.
contract TestStrategyVault {
    error ZeroDeposit();
    error ZeroReceiver();
    error InsufficientShares();
    error TransferFailed();

    string public constant NAME = "Interlock Test Strategy Vault";

    uint256 public totalAssets;
    mapping(address => uint256) public sharesOf;

    event StrategyDeposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);

    receive() external payable {}

    function asset() external pure returns (address) {
        return address(0);
    }

    function maxDeposit(address) external pure returns (uint256) {
        return 1 ether;
    }

    function previewDeposit(uint256 assets) external pure returns (uint256 shares) {
        return assets;
    }

    function depositFor(address receiver) external payable returns (uint256 shares) {
        if (receiver == address(0)) revert ZeroReceiver();
        if (msg.value == 0) revert ZeroDeposit();

        shares = msg.value;
        totalAssets += msg.value;
        sharesOf[receiver] += shares;

        emit StrategyDeposit(msg.sender, receiver, msg.value, shares);
    }

    function withdraw(uint256 shares, address payable receiver) external returns (uint256 assets) {
        if (receiver == address(0)) revert ZeroReceiver();
        if (shares == 0 || sharesOf[msg.sender] < shares) revert InsufficientShares();

        sharesOf[msg.sender] -= shares;
        totalAssets -= shares;
        assets = shares;

        // slither-disable-next-line low-level-calls
        (bool ok,) = receiver.call{value: assets}("");
        if (!ok) revert TransferFailed();
    }
}
