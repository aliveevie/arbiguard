// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArbiGuardFirewall} from "../src/ArbiGuardFirewall.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {RiskPolicyRegistry} from "../src/RiskPolicyRegistry.sol";
import {ThreatSignatureRegistry} from "../src/ThreatSignatureRegistry.sol";
import {RiskEngineSolidity} from "../src/RiskEngineSolidity.sol";

contract ArbiGuardFirewallTest is Test {
    ArbiGuardFirewall firewall;
    ReputationRegistry reputation;
    RiskPolicyRegistry policies;
    ThreatSignatureRegistry threats;
    RiskEngineSolidity engine;

    uint256 officerKey = 0xA11CE;
    address officer;

    address agent = address(0xA6E47); // reputable agent
    address rookie = address(0x0B5C); // registered but low reputation
    address poolA = address(0xA001);
    address poolB = address(0xB002);

    uint256 constant MIN_REPUTATION = 100;
    bytes32 constant RADIANT_SIG = keccak256("flash_loan_abuse:radiant_flashloan_2024");

    function setUp() public {
        reputation = new ReputationRegistry();
        policies = new RiskPolicyRegistry();
        threats = new ThreatSignatureRegistry();
        engine = new RiskEngineSolidity();
        firewall = new ArbiGuardFirewall(reputation, policies, threats, MIN_REPUTATION);

        // wire authorities
        threats.setPublisher(address(firewall), true);
        policies.setConsumer(address(firewall), true);
        firewall.setRiskEngine(engine);

        // agents: one above the reputation gate, one below
        uint256 agentId = reputation.newAgent("guard.arbiguard.eth", agent);
        reputation.acceptFeedback(agentId, 150);
        reputation.newAgent("rookie.arbiguard.eth", rookie);

        // pools with signed policies
        officer = vm.addr(officerKey);
        _registerPoolWithPolicy(poolA);
        _registerPoolWithPolicy(poolB);
    }

    function _registerPoolWithPolicy(address pool) internal {
        firewall.registerPool(pool);
        policies.setRiskOfficer(pool, officer);
        RiskPolicyRegistry.RiskPolicy memory policy = RiskPolicyRegistry.RiskPolicy({
            pool: pool,
            flagThreshold: 31,
            blockThreshold: 61,
            sustainBlocks: 2,
            cooldownBlocks: 5,
            maxVolumePerBlock: 1000 ether,
            nonce: policies.nonces(pool),
            deadline: block.timestamp + 1 days
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(officerKey, policies.hashPolicy(policy));
        policies.registerPolicy(policy, abi.encodePacked(r, s, v));
    }

    function _state(address pool) internal view returns (ArbiGuardFirewall.BreakerState) {
        return firewall.getPoolState(pool).state;
    }

    // ── FSM transitions ─────────────────────────────────────────────────────
    function test_FSM_NormalToElevated_OnBlockZoneScore() public {
        vm.prank(agent);
        firewall.reportScore(poolA, 73, RADIANT_SIG);
        assertEq(uint256(_state(poolA)), uint256(ArbiGuardFirewall.BreakerState.ELEVATED));
        assertFalse(threats.isKnownThreat(RADIANT_SIG), "no publication before trip");
    }

    function test_FSM_ElevatedToTripped_WhenAnomalySustains() public {
        vm.startPrank(agent);
        firewall.reportScore(poolA, 73, RADIANT_SIG); // block N: NORMAL -> ELEVATED
        vm.roll(block.number + 1);
        firewall.reportScore(poolA, 75, RADIANT_SIG); // block N+1: sustained -> TRIPPED
        vm.stopPrank();

        assertEq(uint256(_state(poolA)), uint256(ArbiGuardFirewall.BreakerState.TRIPPED));
        assertTrue(threats.isKnownThreat(RADIANT_SIG), "trip publishes the signature");
        assertFalse(firewall.isActionAllowed(poolA, bytes32("any")), "tripped pool blocks actions");
    }

    function test_FSM_SingleBlockAnomalyDoesNotTrip() public {
        vm.startPrank(agent);
        firewall.reportScore(poolA, 95, RADIANT_SIG); // one anomalous block, extreme score
        assertEq(uint256(_state(poolA)), uint256(ArbiGuardFirewall.BreakerState.ELEVATED));

        vm.roll(block.number + 1);
        firewall.reportScore(poolA, 5, bytes32(0)); // next block back to normal
        vm.stopPrank();

        assertEq(
            uint256(_state(poolA)),
            uint256(ArbiGuardFirewall.BreakerState.NORMAL),
            "single-block anomaly de-escalates instead of tripping"
        );
        assertFalse(threats.isKnownThreat(RADIANT_SIG), "nothing published");
        assertTrue(firewall.isActionAllowed(poolA, bytes32("any")));
    }

    function test_FSM_RepeatedHighScoresSameBlockDoNotTrip() public {
        vm.startPrank(agent);
        firewall.reportScore(poolA, 95, RADIANT_SIG);
        firewall.reportScore(poolA, 95, RADIANT_SIG); // same block: still 1 distinct high block
        firewall.reportScore(poolA, 95, RADIANT_SIG);
        vm.stopPrank();
        assertEq(uint256(_state(poolA)), uint256(ArbiGuardFirewall.BreakerState.ELEVATED));
    }

    function test_FSM_FlagZoneHoldsElevated() public {
        vm.startPrank(agent);
        firewall.reportScore(poolA, 73, RADIANT_SIG);
        vm.roll(block.number + 1);
        firewall.reportScore(poolA, 45, bytes32(0)); // flag zone: hold, don't escalate or clear
        vm.stopPrank();
        assertEq(uint256(_state(poolA)), uint256(ArbiGuardFirewall.BreakerState.ELEVATED));
    }

    function test_FSM_TrippedToCooldown_AfterCooldownBlocks() public {
        _tripPoolA();

        vm.expectRevert(ArbiGuardFirewall.CooldownNotElapsed.selector);
        firewall.advance(poolA);

        vm.roll(block.number + 5);
        firewall.advance(poolA);
        assertEq(uint256(_state(poolA)), uint256(ArbiGuardFirewall.BreakerState.COOLDOWN));
    }

    function test_FSM_CooldownToNormal_AfterSecondCooldown() public {
        _tripPoolA();
        vm.roll(block.number + 5);
        firewall.advance(poolA);

        vm.expectRevert(ArbiGuardFirewall.CooldownNotElapsed.selector);
        firewall.advance(poolA);

        vm.roll(block.number + 5);
        firewall.advance(poolA);
        assertEq(uint256(_state(poolA)), uint256(ArbiGuardFirewall.BreakerState.NORMAL));
    }

    function test_FSM_CooldownReTripsImmediately_OnBlockZoneScore() public {
        _tripPoolA();
        vm.roll(block.number + 5);
        firewall.advance(poolA);
        assertEq(uint256(_state(poolA)), uint256(ArbiGuardFirewall.BreakerState.COOLDOWN));

        vm.prank(agent);
        firewall.reportScore(poolA, 80, keccak256("resurgent"));
        assertEq(
            uint256(_state(poolA)),
            uint256(ArbiGuardFirewall.BreakerState.TRIPPED),
            "hysteresis: during cooldown a single high block re-trips"
        );
    }

    // ── ERC-8004 reputation gating ──────────────────────────────────────────
    function test_Gating_RevertWhen_UnregisteredAddressReports() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(ArbiGuardFirewall.AgentNotReputable.selector);
        firewall.reportScore(poolA, 73, RADIANT_SIG);
    }

    function test_Gating_RevertWhen_LowReputationAgentReports() public {
        vm.prank(rookie); // registered, reputation 0 < MIN_REPUTATION
        vm.expectRevert(ArbiGuardFirewall.AgentNotReputable.selector);
        firewall.reportScore(poolA, 73, RADIANT_SIG);
    }

    function test_Gating_AgentCrossesGateAfterFeedback() public {
        uint256 rookieId = reputation.agentIdOf(rookie);
        reputation.acceptFeedback(rookieId, int256(MIN_REPUTATION));

        vm.prank(rookie);
        firewall.reportScore(poolA, 73, RADIANT_SIG);
        assertEq(uint256(_state(poolA)), uint256(ArbiGuardFirewall.BreakerState.ELEVATED));
    }

    function test_Gating_AppliesToAssessAndReport() public {
        uint256[] memory features = _radiantFeatures();
        vm.prank(rookie);
        vm.expectRevert(ArbiGuardFirewall.AgentNotReputable.selector);
        firewall.assessAndReport(poolA, features, RADIANT_SIG);
    }

    // ── On-chain engine integration ─────────────────────────────────────────
    function test_AssessAndReport_ScoresOnChainAndElevates() public {
        uint256[] memory features = _radiantFeatures();
        vm.prank(agent);
        uint256 score = firewall.assessAndReport(poolA, features, RADIANT_SIG);
        assertEq(score, 73, "on-chain engine reproduces the replay score");
        assertEq(uint256(_state(poolA)), uint256(ArbiGuardFirewall.BreakerState.ELEVATED));
    }

    // ── Cross-protocol threat sharing ───────────────────────────────────────
    function test_CrossProtocol_SecondPoolShieldedWithNoExtraAction() public {
        // pool A trips on the Radiant pattern; nothing ever touches pool B
        _tripPoolA();

        assertEq(uint256(_state(poolB)), uint256(ArbiGuardFirewall.BreakerState.NORMAL), "pool B untouched");
        assertFalse(
            firewall.isActionAllowed(poolB, RADIANT_SIG),
            "pool B is shielded from the published signature with no action of its own"
        );
        assertTrue(firewall.isActionAllowed(poolB, keccak256("benign")), "pool B still serves benign actions");
    }

    // ── Misc ────────────────────────────────────────────────────────────────
    function test_RevertWhen_ReportingUnregisteredPool() public {
        vm.prank(agent);
        vm.expectRevert(ArbiGuardFirewall.PoolNotRegistered.selector);
        firewall.reportScore(address(0xF00D), 73, RADIANT_SIG);
    }

    function test_RecordVolume_RoutesThroughPolicyRegistry() public {
        assertEq(firewall.recordVolume(poolA, 400 ether), 400 ether);
        vm.expectRevert(
            abi.encodeWithSelector(RiskPolicyRegistry.VolumeExceeded.selector, 1400 ether, 1000 ether)
        );
        firewall.recordVolume(poolA, 1000 ether);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    function _tripPoolA() internal {
        vm.startPrank(agent);
        firewall.reportScore(poolA, 73, RADIANT_SIG);
        vm.roll(block.number + 1);
        firewall.reportScore(poolA, 75, RADIANT_SIG);
        vm.stopPrank();
        assertEq(uint256(_state(poolA)), uint256(ArbiGuardFirewall.BreakerState.TRIPPED));
    }

    function _radiantFeatures() internal pure returns (uint256[] memory f) {
        f = new uint256[](8);
        f[0] = 1; // flash loan detected
        f[1] = 1150000; // spot 1.15
        f[2] = 980000; // twap 0.98
        f[3] = 0;
        f[4] = 4; // max depth
        f[5] = 0;
        f[6] = 1; // liquidation event
        f[7] = 1; // oracle update same block
    }
}
