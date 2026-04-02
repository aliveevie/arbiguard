// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ArbiGuardCircuitBreaker} from "../src/ArbiGuardCircuitBreaker.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/// @dev Mock VRF Coordinator that implements the interface expected by VRFConsumerBaseV2Plus
contract MockVRFCoordinator {
    uint256 private _nextRequestId = 1;

    function requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest calldata
    ) external returns (uint256 requestId) {
        requestId = _nextRequestId++;
    }
}

contract ArbiGuardCircuitBreakerTest is Test {
    ArbiGuardCircuitBreaker public breaker;
    MockVRFCoordinator public mockCoordinator;

    address public guardian = address(0xBEEF);
    address public pool = address(0xCAFE);
    address public defender1 = address(0xDEF1);
    address public defender2 = address(0xDEF2);

    bytes32 constant KEY_HASH = bytes32(uint256(1));
    uint256 constant SUB_ID = 1;

    function setUp() public {
        // Start at a realistic block number
        vm.roll(100);
        mockCoordinator = new MockVRFCoordinator();
        breaker = new ArbiGuardCircuitBreaker(
            address(mockCoordinator),
            SUB_ID,
            KEY_HASH
        );
    }

    function test_RegisterPool() public {
        breaker.registerPool(pool);
        (bool active, bool paused,,, ) = breaker.poolConfigs(pool);
        assertTrue(active);
        assertFalse(paused);
    }

    function test_AddGuardian() public {
        breaker.addGuardian(guardian);
        assertTrue(breaker.guardians(guardian));
    }

    function test_RemoveGuardian() public {
        breaker.addGuardian(guardian);
        breaker.removeGuardian(guardian);
        assertFalse(breaker.guardians(guardian));
    }

    function test_SetRateLimit() public {
        breaker.registerPool(pool);
        breaker.setRateLimit(pool, 1000 ether, 5);

        (bool active,, uint256 maxVol, uint256 cooldown, ) = breaker.poolConfigs(pool);
        assertTrue(active);
        assertEq(maxVol, 1000 ether);
        assertEq(cooldown, 5);
    }

    function test_RegisterDefender() public {
        breaker.registerPool(pool);
        breaker.registerDefender(pool, defender1);
        breaker.registerDefender(pool, defender2);
    }

    function test_RevertPausePool_NotRegistered() public {
        vm.expectRevert(ArbiGuardCircuitBreaker.PoolNotRegistered.selector);
        breaker.pausePool(pool);
    }

    function test_RevertPausePool_NotGuardian() public {
        breaker.registerPool(pool);
        vm.prank(address(0xBAD));
        vm.expectRevert(ArbiGuardCircuitBreaker.NotGuardian.selector);
        breaker.pausePool(pool);
    }

    function test_PausePool() public {
        breaker.registerPool(pool);
        breaker.pausePool(pool);
        assertTrue(breaker.isPoolPaused(pool));
    }

    function test_UnpausePool() public {
        breaker.registerPool(pool);
        breaker.pausePool(pool);
        assertTrue(breaker.isPoolPaused(pool));

        breaker.unpausePool(pool);
        assertFalse(breaker.isPoolPaused(pool));
    }

    function test_ThreatHistory() public {
        breaker.registerPool(pool);
        breaker.pausePool(pool);
        assertEq(breaker.getThreatHistoryLength(), 1);

        breaker.setRateLimit(pool, 500 ether, 3);
        assertEq(breaker.getThreatHistoryLength(), 2);
    }

    function test_CooldownEnforced() public {
        breaker.registerPool(pool);
        breaker.pausePool(pool);

        // Unpause, then try to pause again within cooldown
        breaker.unpausePool(pool);
        vm.expectRevert(ArbiGuardCircuitBreaker.CooldownActive.selector);
        breaker.pausePool(pool);

        // Roll forward past cooldown
        vm.roll(block.number + 11);
        breaker.pausePool(pool);
        assertTrue(breaker.isPoolPaused(pool));
    }

    function test_GetPoolConfig() public {
        breaker.registerPool(pool);
        breaker.setRateLimit(pool, 100 ether, 10);

        ArbiGuardCircuitBreaker.PoolConfig memory config = breaker.getPoolConfig(pool);
        assertTrue(config.active);
        assertEq(config.maxVolumePerBlock, 100 ether);
        assertEq(config.cooldownBlocks, 10);
    }
}
