// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ThreatSignatureRegistry} from "../src/ThreatSignatureRegistry.sol";

contract ThreatSignatureRegistryTest is Test {
    ThreatSignatureRegistry registry;

    address publisherA = address(0xA1);
    address publisherB = address(0xB2);
    bytes32 sig = keccak256("radiant_flashloan_2024:flash_loan_abuse");

    function setUp() public {
        registry = new ThreatSignatureRegistry();
        registry.setPublisher(publisherA, true);
        registry.setPublisher(publisherB, true);
    }

    function test_PublishThreat_StoresRecord() public {
        vm.prank(publisherA);
        registry.publishThreat(sig, 1, 73);

        assertTrue(registry.isKnownThreat(sig));
        ThreatSignatureRegistry.ThreatRecord memory rec = registry.getThreat(sig);
        assertEq(rec.signature, sig);
        assertEq(rec.threatType, 1);
        assertEq(rec.score, 73);
        assertEq(rec.reporter, publisherA);
        assertEq(registry.threatCount(), 1);
    }

    function test_WriteOnce_SamePublisherCannotRepublish() public {
        vm.startPrank(publisherA);
        registry.publishThreat(sig, 1, 73);
        vm.expectRevert(abi.encodeWithSelector(ThreatSignatureRegistry.ThreatAlreadyPublished.selector, sig));
        registry.publishThreat(sig, 2, 99);
        vm.stopPrank();
    }

    function test_WriteOnce_OtherPublisherCannotOverwrite() public {
        vm.prank(publisherA);
        registry.publishThreat(sig, 1, 73);

        vm.prank(publisherB);
        vm.expectRevert(abi.encodeWithSelector(ThreatSignatureRegistry.ThreatAlreadyPublished.selector, sig));
        registry.publishThreat(sig, 0, 1);

        // original record untouched
        ThreatSignatureRegistry.ThreatRecord memory rec = registry.getThreat(sig);
        assertEq(rec.score, 73);
        assertEq(rec.reporter, publisherA);
    }

    function test_ReadByAll_AnyAddressCanQuery() public {
        vm.prank(publisherA);
        registry.publishThreat(sig, 1, 73);

        // unauthenticated third parties can read
        vm.prank(address(0xDEAD));
        assertTrue(registry.isKnownThreat(sig));
        vm.prank(address(0xFEED));
        assertEq(registry.getThreat(sig).score, 73);
    }

    function test_RevertWhen_UnauthorizedPublisher() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(ThreatSignatureRegistry.NotPublisher.selector);
        registry.publishThreat(sig, 1, 73);
    }

    function test_UnknownSignatureIsNotKnown() public view {
        assertFalse(registry.isKnownThreat(keccak256("unseen")));
    }

    function test_RevertWhen_GetUnknownThreat() public {
        bytes32 unknown = keccak256("unseen");
        vm.expectRevert(abi.encodeWithSelector(ThreatSignatureRegistry.UnknownThreat.selector, unknown));
        registry.getThreat(unknown);
    }
}
