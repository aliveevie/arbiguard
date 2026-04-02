// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ArbiGuardCircuitBreaker} from "../src/ArbiGuardCircuitBreaker.sol";

contract Deploy is Script {
    // Arbitrum Sepolia Chainlink VRF Coordinator
    address constant VRF_COORDINATOR = 0x5CE8D5A2BC84beb22a398CCA51996F7930313D61;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 subscriptionId = vm.envUint("CHAINLINK_VRF_SUBSCRIPTION_ID");
        bytes32 keyHash = vm.envBytes32("CHAINLINK_VRF_KEY_HASH");

        vm.startBroadcast(deployerPrivateKey);

        ArbiGuardCircuitBreaker breaker = new ArbiGuardCircuitBreaker(
            VRF_COORDINATOR,
            subscriptionId,
            keyHash
        );

        console.log("ArbiGuardCircuitBreaker deployed at:", address(breaker));

        vm.stopBroadcast();
    }
}
