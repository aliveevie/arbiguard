// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ThreatTypes
/// @notice Shared enums and structs for on-chain threat classification.
library ThreatTypes {
    enum ThreatLevel {
        None,       // 0
        Low,        // 1
        Medium,     // 2
        High,       // 3
        Critical    // 4
    }

    enum ActionTaken {
        None,
        RateLimited,
        Paused
    }

    struct ThreatReport {
        address pool;
        ThreatLevel level;
        ActionTaken action;
        uint256 blockNumber;
        address reporter;
    }
}
