// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RiskPolicyRegistry} from "../src/RiskPolicyRegistry.sol";

contract RiskPolicyRegistryTest is Test {
    RiskPolicyRegistry registry;

    uint256 officerKey = 0xA11CE;
    address officer;
    address pool = address(0xBEEF);
    address consumer = address(0xCAFE);

    function setUp() public {
        registry = new RiskPolicyRegistry();
        officer = vm.addr(officerKey);
        registry.setRiskOfficer(pool, officer);
        registry.setConsumer(consumer, true);
    }

    function _defaultPolicy() internal view returns (RiskPolicyRegistry.RiskPolicy memory) {
        return RiskPolicyRegistry.RiskPolicy({
            pool: pool,
            flagThreshold: 31,
            blockThreshold: 61,
            sustainBlocks: 2,
            cooldownBlocks: 5,
            maxVolumePerBlock: 1000 ether,
            nonce: registry.nonces(pool),
            deadline: block.timestamp + 1 days
        });
    }

    function _sign(RiskPolicyRegistry.RiskPolicy memory policy, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, registry.hashPolicy(policy));
        return abi.encodePacked(r, s, v);
    }

    // ── Signing & registration ──────────────────────────────────────────────
    function test_RegisterPolicy_WithValidEip712Signature() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        registry.registerPolicy(policy, _sign(policy, officerKey));

        assertTrue(registry.hasPolicy(pool));
        RiskPolicyRegistry.RiskPolicy memory stored = registry.getPolicy(pool);
        assertEq(stored.flagThreshold, 31);
        assertEq(stored.blockThreshold, 61);
        assertEq(stored.sustainBlocks, 2);
        assertEq(registry.nonces(pool), 1, "nonce consumed");
    }

    function test_RegisterPolicy_AnyoneCanSubmitOfficerSignedPolicy() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        bytes memory sig = _sign(policy, officerKey);
        vm.prank(address(0xD00D)); // relayer, not the officer
        registry.registerPolicy(policy, sig);
        assertTrue(registry.hasPolicy(pool));
    }

    function test_RevertWhen_SignerIsNotRiskOfficer() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        bytes memory sig = _sign(policy, 0xBAD0); // wrong key
        vm.expectRevert(RiskPolicyRegistry.InvalidSigner.selector);
        registry.registerPolicy(policy, sig);
    }

    function test_RevertWhen_PolicyExpired() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        policy.deadline = block.timestamp - 1;
        bytes memory sig = _sign(policy, officerKey);
        vm.expectRevert(RiskPolicyRegistry.PolicyExpired.selector);
        registry.registerPolicy(policy, sig);
    }

    function test_RevertWhen_NonceReplayed() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        bytes memory sig = _sign(policy, officerKey);
        registry.registerPolicy(policy, sig);
        vm.expectRevert(RiskPolicyRegistry.InvalidNonce.selector);
        registry.registerPolicy(policy, sig);
    }

    function test_RevertWhen_NoRiskOfficerSet() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        policy.pool = address(0xF00D); // no officer configured
        bytes memory sig = _sign(policy, officerKey);
        vm.expectRevert(RiskPolicyRegistry.NoRiskOfficer.selector);
        registry.registerPolicy(policy, sig);
    }

    function test_RevertWhen_ThresholdsInvalid() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        policy.blockThreshold = policy.flagThreshold; // block must exceed flag
        bytes memory sig = _sign(policy, officerKey);
        vm.expectRevert(RiskPolicyRegistry.InvalidThresholds.selector);
        registry.registerPolicy(policy, sig);
    }

    function test_PolicyUpdate_UsesNextNonce() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        registry.registerPolicy(policy, _sign(policy, officerKey));

        policy.blockThreshold = 80;
        policy.nonce = registry.nonces(pool);
        registry.registerPolicy(policy, _sign(policy, officerKey));
        assertEq(registry.getPolicy(pool).blockThreshold, 80);
    }

    // ── Enforcement zones ───────────────────────────────────────────────────
    function test_Enforcement_AllowBelowFlagThreshold() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        registry.registerPolicy(policy, _sign(policy, officerKey));

        assertEq(uint256(registry.enforcementAction(pool, 0)), uint256(RiskPolicyRegistry.Action.Allow));
        assertEq(uint256(registry.enforcementAction(pool, 30)), uint256(RiskPolicyRegistry.Action.Allow));
    }

    function test_Enforcement_RateLimitInFlagZone() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        registry.registerPolicy(policy, _sign(policy, officerKey));

        assertEq(uint256(registry.enforcementAction(pool, 31)), uint256(RiskPolicyRegistry.Action.RateLimit));
        assertEq(uint256(registry.enforcementAction(pool, 60)), uint256(RiskPolicyRegistry.Action.RateLimit));
    }

    function test_Enforcement_BlockAtOrAboveBlockThreshold() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        registry.registerPolicy(policy, _sign(policy, officerKey));

        assertEq(uint256(registry.enforcementAction(pool, 61)), uint256(RiskPolicyRegistry.Action.Block));
        assertEq(uint256(registry.enforcementAction(pool, 100)), uint256(RiskPolicyRegistry.Action.Block));
    }

    function test_RevertWhen_EnforcementWithoutPolicy() public {
        vm.expectRevert(RiskPolicyRegistry.PolicyNotRegistered.selector);
        registry.enforcementAction(address(0xF00D), 50);
    }

    // ── Rate-limit accounting ───────────────────────────────────────────────
    function test_RateLimit_VolumeWithinCapAccumulates() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        registry.registerPolicy(policy, _sign(policy, officerKey));

        vm.startPrank(consumer);
        assertEq(registry.checkAndRecordVolume(pool, 400 ether), 400 ether);
        assertEq(registry.checkAndRecordVolume(pool, 600 ether), 1000 ether);
        vm.stopPrank();
    }

    function test_RateLimit_RevertWhenPerBlockCapExceeded() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        registry.registerPolicy(policy, _sign(policy, officerKey));

        vm.startPrank(consumer);
        registry.checkAndRecordVolume(pool, 900 ether);
        vm.expectRevert(
            abi.encodeWithSelector(RiskPolicyRegistry.VolumeExceeded.selector, 1100 ether, 1000 ether)
        );
        registry.checkAndRecordVolume(pool, 200 ether);
        vm.stopPrank();
    }

    function test_RateLimit_ResetsNextBlock() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        registry.registerPolicy(policy, _sign(policy, officerKey));

        vm.startPrank(consumer);
        registry.checkAndRecordVolume(pool, 1000 ether);
        vm.roll(block.number + 1);
        assertEq(registry.checkAndRecordVolume(pool, 1000 ether), 1000 ether);
        vm.stopPrank();
    }

    function test_RevertWhen_UnauthorizedConsumerRecordsVolume() public {
        RiskPolicyRegistry.RiskPolicy memory policy = _defaultPolicy();
        registry.registerPolicy(policy, _sign(policy, officerKey));

        vm.prank(address(0xD00D));
        vm.expectRevert(RiskPolicyRegistry.NotConsumer.selector);
        registry.checkAndRecordVolume(pool, 1 ether);
    }
}
