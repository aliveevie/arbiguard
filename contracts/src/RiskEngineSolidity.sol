// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRiskEngine} from "./interfaces/IRiskEngine.sol";

/// @title RiskEngineSolidity
/// @notice Reference implementation of the ArbiGuard risk scorer. Mirrors the
///         Stylus engine (contracts-stylus/src/scoring.rs) and the off-chain
///         TypeScript engine (skill/detection/engine.ts) exactly — same
///         weights, thresholds, fixed-point math, and half-up rounding.
///         Deployed on chains where Stylus is not available.
contract RiskEngineSolidity is IRiskEngine {
    uint256 public constant THRESHOLD_FLAG = 31;
    uint256 public constant THRESHOLD_BLOCK = 61;

    /// @inheritdoc IRiskEngine
    function score(uint256[] calldata features) public pure returns (uint256 total) {
        uint256[5] memory parts = _indicatorScores(features);
        for (uint256 i = 0; i < 5; i++) {
            total += parts[i];
        }
    }

    /// @inheritdoc IRiskEngine
    function recommendation(uint256[] calldata features) external pure returns (uint256) {
        uint256 total = score(features);
        if (total >= THRESHOLD_BLOCK) return 2;
        if (total >= THRESHOLD_FLAG) return 1;
        return 0;
    }

    /// @notice Per-indicator breakdown: [flash, price, sandwich, reentrancy, liquidation].
    function indicatorScores(uint256[] calldata features) external pure returns (uint256[5] memory) {
        return _indicatorScores(features);
    }

    function _indicatorScores(uint256[] calldata features) internal pure returns (uint256[5] memory parts) {
        uint256 f0 = _at(features, 0); // flash detected
        uint256 spotE6 = _at(features, 1);
        uint256 twapE6 = _at(features, 2);
        uint256 f3 = _at(features, 3); // sandwich detected
        uint256 maxDepth = _at(features, 4);
        uint256 f5 = _at(features, 5); // repeated deep target
        uint256 f6 = _at(features, 6); // liquidation event
        uint256 f7 = _at(features, 7); // oracle update same block

        parts[0] = f0 != 0 ? 30 : 0;
        parts[1] = _priceDeviationScore(spotE6, twapE6);
        parts[2] = f3 != 0 ? 20 : 0;
        parts[3] = maxDepth > 3 ? (f5 != 0 ? 15 : 8) : 0;
        parts[4] = (f6 != 0 && f7 != 0) ? 10 : 0;
    }

    /// @dev detected iff 50*dev > 3*twap; score = min(25, round_half_up(250*dev/twap)).
    function _priceDeviationScore(uint256 spotE6, uint256 twapE6) internal pure returns (uint256) {
        if (twapE6 == 0) return 0;
        uint256 dev = spotE6 > twapE6 ? spotE6 - twapE6 : twapE6 - spotE6;
        if (50 * dev <= 3 * twapE6) return 0;
        uint256 rounded = (2 * 250 * dev + twapE6) / (2 * twapE6);
        return rounded > 25 ? 25 : rounded;
    }

    function _at(uint256[] calldata features, uint256 i) private pure returns (uint256) {
        return i < features.length ? features[i] : 0;
    }
}
