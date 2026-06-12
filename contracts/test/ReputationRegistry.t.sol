// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

contract ReputationRegistryTest is Test {
    ReputationRegistry registry;

    address agent = address(0xA6E47);
    address feedbackSource = address(0xFEED);

    function setUp() public {
        registry = new ReputationRegistry();
        registry.setFeedbackSource(feedbackSource, true);
    }

    function test_NewAgent_AssignsSequentialIds() public {
        uint256 id1 = registry.newAgent("guard.arbiguard.eth", agent);
        uint256 id2 = registry.newAgent("watcher.arbiguard.eth", address(0xB0B));
        assertEq(id1, 1);
        assertEq(id2, 2);

        ReputationRegistry.AgentInfo memory info = registry.resolveByAddress(agent);
        assertEq(info.agentId, id1);
        assertEq(info.agentDomain, "guard.arbiguard.eth");
        assertEq(info.agentAddress, agent);
    }

    function test_RevertWhen_AgentAddressReused() public {
        registry.newAgent("guard.arbiguard.eth", agent);
        vm.expectRevert(ReputationRegistry.AgentAlreadyRegistered.selector);
        registry.newAgent("other.domain.eth", agent);
    }

    function test_Feedback_AccruesAndDecays() public {
        uint256 id = registry.newAgent("guard.arbiguard.eth", agent);

        vm.startPrank(feedbackSource);
        registry.acceptFeedback(id, 100);
        assertEq(registry.reputationOf(id), 100);
        registry.acceptFeedback(id, -30);
        assertEq(registry.reputationOf(id), 70);
        registry.acceptFeedback(id, -200); // floors at zero
        assertEq(registry.reputationOf(id), 0);
        vm.stopPrank();
    }

    function test_RevertWhen_UnauthorizedFeedbackSource() public {
        uint256 id = registry.newAgent("guard.arbiguard.eth", agent);
        vm.prank(address(0xDEAD));
        vm.expectRevert(ReputationRegistry.NotFeedbackSource.selector);
        registry.acceptFeedback(id, 10);
    }

    function test_IsReputable_GateChecks() public {
        assertFalse(registry.isReputable(agent, 0), "unregistered agent fails even at 0 threshold");

        uint256 id = registry.newAgent("guard.arbiguard.eth", agent);
        assertTrue(registry.isReputable(agent, 0));
        assertFalse(registry.isReputable(agent, 50));

        vm.prank(feedbackSource);
        registry.acceptFeedback(id, 50);
        assertTrue(registry.isReputable(agent, 50));
    }
}
