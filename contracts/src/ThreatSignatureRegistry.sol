// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ThreatSignatureRegistry
/// @notice Shared cross-protocol threat intelligence. The first firewall to
///         confirm an exploit pattern publishes its signature once; every
///         other protocol reading the registry is immediately shielded from
///         the same pattern without taking any action of its own.
contract ThreatSignatureRegistry is Ownable {
    error NotPublisher();
    error ThreatAlreadyPublished(bytes32 signature);
    error UnknownThreat(bytes32 signature);

    struct ThreatRecord {
        bytes32 signature;
        uint8 threatType;
        uint16 score;
        address reporter;
        uint64 blockNumber;
        uint64 publishedAt;
    }

    mapping(bytes32 => ThreatRecord) private _records;
    mapping(address => bool) public publishers;
    bytes32[] public signatures;

    event PublisherSet(address indexed publisher, bool authorized);
    event ThreatPublished(bytes32 indexed signature, uint8 threatType, uint16 score, address indexed reporter);

    modifier onlyPublisher() {
        if (!publishers[msg.sender] && msg.sender != owner()) revert NotPublisher();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setPublisher(address publisher, bool authorized) external onlyOwner {
        publishers[publisher] = authorized;
        emit PublisherSet(publisher, authorized);
    }

    /// @notice Write-once: a signature can never be overwritten or republished.
    function publishThreat(bytes32 signature, uint8 threatType, uint16 score) external onlyPublisher {
        if (_records[signature].publishedAt != 0) revert ThreatAlreadyPublished(signature);

        _records[signature] = ThreatRecord({
            signature: signature,
            threatType: threatType,
            score: score,
            reporter: msg.sender,
            blockNumber: uint64(block.number),
            publishedAt: uint64(block.timestamp)
        });
        signatures.push(signature);
        emit ThreatPublished(signature, threatType, score, msg.sender);
    }

    /// @notice Open read access — any protocol can check any signature.
    function isKnownThreat(bytes32 signature) external view returns (bool) {
        return _records[signature].publishedAt != 0;
    }

    function getThreat(bytes32 signature) external view returns (ThreatRecord memory record) {
        record = _records[signature];
        if (record.publishedAt == 0) revert UnknownThreat(signature);
    }

    function threatCount() external view returns (uint256) {
        return signatures.length;
    }
}
