// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IArbiGuardTarget
/// @notice Interface that target protocol pools must implement to be pausable by ArbiGuard.
interface IArbiGuardTarget {
    /// @notice Pause all pool operations.
    function pause() external;

    /// @notice Resume pool operations.
    function unpause() external;

    /// @notice Returns whether the pool is currently paused.
    function isPaused() external view returns (bool);
}
