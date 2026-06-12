// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRiskEngine
/// @notice Canonical risk scorer interface. Implemented by the Stylus
///         RiskEngine (contracts-stylus/) on Arbitrum and by
///         RiskEngineSolidity as a reference / fallback implementation.
///         Feature vector layout (8 elements):
///           [0] flash loan detected            (0 or 1)
///           [1] spot price, fixed-point 1e6
///           [2] TWAP price, fixed-point 1e6
///           [3] sandwich pattern detected      (0 or 1)
///           [4] max call depth
///           [5] repeated deep target detected  (0 or 1)
///           [6] liquidation event present      (0 or 1)
///           [7] oracle update in same block    (0 or 1)
interface IRiskEngine {
    /// @notice Total risk score (0-100).
    function score(uint256[] calldata features) external view returns (uint256);

    /// @notice 0 = allow, 1 = flag, 2 = block.
    function recommendation(uint256[] calldata features) external view returns (uint256);
}
