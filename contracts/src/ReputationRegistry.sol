// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationRegistry
/// @notice ERC-8004-style agent identity + reputation registry. Agents
///         register an identity (domain + address); authorized feedback
///         sources accrue reputation. Protective contracts (the firewall)
///         gate actions on a minimum reputation, so only agents with an
///         on-chain track record can trigger circuit breakers.
contract ReputationRegistry is Ownable {
    error AgentAlreadyRegistered();
    error AgentNotRegistered();
    error NotFeedbackSource();
    error EmptyDomain();

    struct AgentInfo {
        uint256 agentId;
        string agentDomain;
        address agentAddress;
        uint64 registeredAt;
    }

    uint256 private _nextAgentId = 1;

    mapping(uint256 => AgentInfo) private _agents;
    mapping(address => uint256) public agentIdOf;
    mapping(uint256 => uint256) private _reputation;
    mapping(address => bool) public feedbackSources;

    event AgentRegistered(uint256 indexed agentId, string agentDomain, address indexed agentAddress);
    event FeedbackAccepted(uint256 indexed agentId, address indexed source, int256 delta, uint256 newReputation);
    event FeedbackSourceAuthorized(address indexed source, bool authorized);

    modifier onlyFeedbackSource() {
        if (!feedbackSources[msg.sender] && msg.sender != owner()) revert NotFeedbackSource();
        _;
    }

    constructor() Ownable(msg.sender) {}

    // ── Identity (ERC-8004 IdentityRegistry-style) ─────────────────────────
    function newAgent(string calldata agentDomain, address agentAddress) external returns (uint256 agentId) {
        if (bytes(agentDomain).length == 0) revert EmptyDomain();
        if (agentIdOf[agentAddress] != 0) revert AgentAlreadyRegistered();

        agentId = _nextAgentId++;
        _agents[agentId] = AgentInfo({
            agentId: agentId,
            agentDomain: agentDomain,
            agentAddress: agentAddress,
            registeredAt: uint64(block.timestamp)
        });
        agentIdOf[agentAddress] = agentId;
        emit AgentRegistered(agentId, agentDomain, agentAddress);
    }

    function resolveByAddress(address agentAddress) external view returns (AgentInfo memory info) {
        uint256 agentId = agentIdOf[agentAddress];
        if (agentId == 0) revert AgentNotRegistered();
        return _agents[agentId];
    }

    function resolveById(uint256 agentId) external view returns (AgentInfo memory info) {
        if (_agents[agentId].agentId == 0) revert AgentNotRegistered();
        return _agents[agentId];
    }

    // ── Reputation (ERC-8004 ReputationRegistry-style) ─────────────────────
    function setFeedbackSource(address source, bool authorized) external onlyOwner {
        feedbackSources[source] = authorized;
        emit FeedbackSourceAuthorized(source, authorized);
    }

    function acceptFeedback(uint256 agentId, int256 delta) external onlyFeedbackSource {
        if (_agents[agentId].agentId == 0) revert AgentNotRegistered();
        uint256 current = _reputation[agentId];
        uint256 updated;
        if (delta >= 0) {
            updated = current + uint256(delta);
        } else {
            uint256 dec = uint256(-delta);
            updated = dec >= current ? 0 : current - dec;
        }
        _reputation[agentId] = updated;
        emit FeedbackAccepted(agentId, msg.sender, delta, updated);
    }

    function reputationOf(uint256 agentId) public view returns (uint256) {
        return _reputation[agentId];
    }

    /// @notice Gate check used by protective contracts: the address must be a
    ///         registered agent with at least `minReputation`.
    function isReputable(address agentAddress, uint256 minReputation) external view returns (bool) {
        uint256 agentId = agentIdOf[agentAddress];
        if (agentId == 0) return false;
        return _reputation[agentId] >= minReputation;
    }
}
