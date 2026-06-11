// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ArbiGuardFirewall} from "../src/ArbiGuardFirewall.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {RiskPolicyRegistry} from "../src/RiskPolicyRegistry.sol";
import {ThreatSignatureRegistry} from "../src/ThreatSignatureRegistry.sol";
import {RiskEngineSolidity} from "../src/RiskEngineSolidity.sol";
import {IRiskEngine} from "../src/interfaces/IRiskEngine.sol";

/// Deploys the full ArbiGuard firewall stack and wires it for the demo:
///   - ReputationRegistry, RiskPolicyRegistry, ThreatSignatureRegistry
///   - RiskEngineSolidity (reference engine; on Arbitrum the Stylus engine
///     can be set afterwards via STYLUS_ENGINE / setRiskEngine)
///   - ArbiGuardFirewall wired as publisher + consumer
///   - registers the agent (ERC-8004 identity + reputation above the gate)
///   - registers two demo RWA pools with EIP-712 signed risk policies
contract DeployFirewall is Script {
    uint256 constant MIN_REPUTATION = 100;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address agent = vm.envOr("AGENT_ADDRESS", deployer);
        address stylusEngine = vm.envOr("STYLUS_ENGINE", address(0));

        address poolA = address(uint160(uint256(keccak256("arbiguard.demo.rwa-pool-alpha"))));
        address poolB = address(uint160(uint256(keccak256("arbiguard.demo.rwa-pool-beta"))));

        vm.startBroadcast(deployerKey);

        ReputationRegistry reputation = new ReputationRegistry();
        RiskPolicyRegistry policies = new RiskPolicyRegistry();
        ThreatSignatureRegistry threats = new ThreatSignatureRegistry();
        RiskEngineSolidity solidityEngine = new RiskEngineSolidity();
        ArbiGuardFirewall firewall = new ArbiGuardFirewall(reputation, policies, threats, MIN_REPUTATION);

        threats.setPublisher(address(firewall), true);
        policies.setConsumer(address(firewall), true);
        firewall.setRiskEngine(
            stylusEngine != address(0) ? IRiskEngine(stylusEngine) : IRiskEngine(address(solidityEngine))
        );

        // ERC-8004 agent identity + reputation above the gate
        uint256 agentId = reputation.newAgent("guard.arbiguard.eth", agent);
        reputation.acceptFeedback(agentId, 150);

        // demo pools + EIP-712 signed policies (deployer acts as risk officer)
        firewall.registerPool(poolA);
        firewall.registerPool(poolB);
        policies.setRiskOfficer(poolA, deployer);
        policies.setRiskOfficer(poolB, deployer);
        _registerSignedPolicy(policies, poolA, deployerKey);
        _registerSignedPolicy(policies, poolB, deployerKey);

        vm.stopBroadcast();

        console.log("chain id:               ", block.chainid);
        console.log("ReputationRegistry:     ", address(reputation));
        console.log("RiskPolicyRegistry:     ", address(policies));
        console.log("ThreatSignatureRegistry:", address(threats));
        console.log("RiskEngineSolidity:     ", address(solidityEngine));
        console.log("ArbiGuardFirewall:      ", address(firewall));
        console.log("agent (id, addr):       ", agentId, agent);
        console.log("demo pool A:            ", poolA);
        console.log("demo pool B:            ", poolB);

        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "reputationRegistry", address(reputation));
        vm.serializeAddress(json, "riskPolicyRegistry", address(policies));
        vm.serializeAddress(json, "threatSignatureRegistry", address(threats));
        vm.serializeAddress(json, "riskEngineSolidity", address(solidityEngine));
        vm.serializeAddress(json, "riskEngine", address(firewall.riskEngine()));
        vm.serializeAddress(json, "firewall", address(firewall));
        vm.serializeAddress(json, "agent", agent);
        vm.serializeAddress(json, "poolA", poolA);
        string memory out = vm.serializeAddress(json, "poolB", poolB);
        vm.writeJson(out, string.concat("../deployments/", vm.toString(block.chainid), ".json"));
    }

    function _registerSignedPolicy(RiskPolicyRegistry policies, address pool, uint256 officerKey) internal {
        RiskPolicyRegistry.RiskPolicy memory policy = RiskPolicyRegistry.RiskPolicy({
            pool: pool,
            flagThreshold: 31,
            blockThreshold: 61,
            sustainBlocks: 2,
            cooldownBlocks: 20,
            maxVolumePerBlock: 1000 ether,
            nonce: policies.nonces(pool),
            deadline: block.timestamp + 365 days
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(officerKey, policies.hashPolicy(policy));
        policies.registerPolicy(policy, abi.encodePacked(r, s, v));
    }
}
