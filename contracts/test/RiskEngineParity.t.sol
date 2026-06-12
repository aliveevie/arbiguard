// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RiskEngineSolidity} from "../src/RiskEngineSolidity.sol";

/// Parity vectors generated from the off-chain TypeScript scorer by
/// scripts/gen-parity-cases.ts — the same values asserted by the Stylus
/// engine's cargo test suite (contracts-stylus/tests/parity_cases.rs).
contract RiskEngineParityTest is Test {
    RiskEngineSolidity engine;

    function setUp() public {
        engine = new RiskEngineSolidity();
    }

    function _features(
        uint256 flash,
        uint256 spotE6,
        uint256 twapE6,
        uint256 sandwich,
        uint256 maxDepth,
        uint256 repeatedDeep,
        uint256 hasLiq,
        uint256 hasOracle
    ) internal pure returns (uint256[] memory f) {
        f = new uint256[](8);
        f[0] = flash;
        f[1] = spotE6;
        f[2] = twapE6;
        f[3] = sandwich;
        f[4] = maxDepth;
        f[5] = repeatedDeep;
        f[6] = hasLiq;
        f[7] = hasOracle;
    }

    function test_Replay_GmxOracleManipulation2022() public view {
        uint256[] memory f = _features(1, 2410000, 1870000, 0, 4, 0, 0, 1);
        assertEq(engine.score(f), 63, "gmx total");
        assertEq(engine.recommendation(f), 2, "gmx recommendation: block");
    }

    function test_Replay_CamelotFlashDrain2023() public view {
        uint256[] memory f = _features(1, 1520000, 1480000, 0, 3, 0, 0, 0);
        assertEq(engine.score(f), 30, "camelot total");
        assertEq(engine.recommendation(f), 0, "camelot recommendation: allow");
    }

    function test_Replay_RadiantFlashloan2024() public view {
        uint256[] memory f = _features(1, 1150000, 980000, 0, 4, 0, 1, 1);
        assertEq(engine.score(f), 73, "radiant total");
        assertEq(engine.recommendation(f), 2, "radiant recommendation: block");
    }

    function test_CleanTransactionScoresZero() public view {
        uint256[] memory f = _features(0, 1000000, 1000000, 0, 1, 0, 0, 0);
        assertEq(engine.score(f), 0);
        assertEq(engine.recommendation(f), 0);
    }

    function test_IndicatorBreakdown_Radiant() public view {
        uint256[] memory f = _features(1, 1150000, 980000, 0, 4, 0, 1, 1);
        uint256[5] memory parts = engine.indicatorScores(f);
        assertEq(parts[0], 30, "flash");
        assertEq(parts[1], 25, "price deviation");
        assertEq(parts[2], 0, "sandwich");
        assertEq(parts[3], 8, "reentrancy (deep, no repeat)");
        assertEq(parts[4], 10, "liquidation correlation");
    }

    function test_PriceDeviationRounding() public view {
        // 250*dev/twap = 16.5 → half-up → 17 (matches JS Math.round)
        uint256[] memory f = _features(0, 1066000, 1000000, 0, 0, 0, 0, 0);
        assertEq(engine.score(f), 17);
    }
}
