// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IInterlockTestStrategyVault {
    function depositFor(address receiver) external payable returns (uint256 shares);
    function previewDeposit(uint256 assets) external view returns (uint256 shares);
}

/// @title Interlock Test Strategy Router
/// @notice A Mantle Sepolia test router that lets demos model DeFi/RWA-style agent deposits.
/// @dev This is intentionally small: Interlock should guard the proposed call, not become a DEX.
contract TestStrategyRouter {
    error ZeroVault();
    error ZeroReceiver();
    error ZeroValue();
    error SlippageTooHigh(uint16 supplied, uint16 maxAllowed);

    uint16 public constant MAX_TEST_SLIPPAGE_BPS = 1_000;

    function routeNativeDeposit(address vault, address receiver, uint16 maxSlippageBps)
        external
        payable
        returns (uint256 shares)
    {
        if (vault == address(0)) revert ZeroVault();
        if (receiver == address(0)) revert ZeroReceiver();
        if (msg.value == 0) revert ZeroValue();
        if (maxSlippageBps > MAX_TEST_SLIPPAGE_BPS) {
            revert SlippageTooHigh(maxSlippageBps, MAX_TEST_SLIPPAGE_BPS);
        }

        shares = IInterlockTestStrategyVault(vault).depositFor{value: msg.value}(receiver);
    }

    function quoteNativeDeposit(address vault, uint256 value) external view returns (uint256 shares) {
        if (vault == address(0) || value == 0) return 0;
        return IInterlockTestStrategyVault(vault).previewDeposit(value);
    }
}
