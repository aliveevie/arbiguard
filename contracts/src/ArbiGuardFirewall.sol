// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IRiskEngine} from "./interfaces/IRiskEngine.sol";
import {ReputationRegistry} from "./ReputationRegistry.sol";
import {RiskPolicyRegistry} from "./RiskPolicyRegistry.sol";
import {ThreatSignatureRegistry} from "./ThreatSignatureRegistry.sol";

/// @title ArbiGuardFirewall
/// @notice Institutional-grade circuit breaker for tokenized-asset pools.
///
///         Risk reports flow through a hysteresis finite-state machine so a
///         single anomalous block can never halt a market:
///
///           NORMAL ──(score ≥ blockThreshold)──────────────► ELEVATED
///           ELEVATED ─(score < flagThreshold)──────────────► NORMAL
///           ELEVATED ─(≥ sustainBlocks distinct high blocks)► TRIPPED
///           TRIPPED ──(cooldownBlocks elapsed, advance())───► COOLDOWN
///           COOLDOWN ─(cooldownBlocks elapsed, advance())───► NORMAL
///           COOLDOWN ─(score ≥ blockThreshold)──────────────► TRIPPED (re-trip)
///
///         Reports are accepted only from agents that pass the ERC-8004
///         reputation gate. Thresholds come from EIP-712 signed policies in
///         the RiskPolicyRegistry. A trip publishes the threat signature to
///         the shared ThreatSignatureRegistry, instantly shielding every
///         other registered pool from the same pattern.
contract ArbiGuardFirewall is Ownable {
    error PoolNotRegistered();
    error PoolAlreadyRegistered();
    error AgentNotReputable();
    error NotTripped();
    error CooldownNotElapsed();
    error RiskEngineNotSet();

    enum BreakerState {
        NORMAL,
        ELEVATED,
        TRIPPED,
        COOLDOWN
    }

    struct PoolState {
        bool registered;
        BreakerState state;
        uint64 lastHighBlock; // last distinct block with a block-zone score
        uint32 highBlockCount; // distinct high-score blocks while ELEVATED
        uint64 trippedAtBlock;
        uint64 cooldownStartBlock;
        bytes32 tripSignature;
        uint16 tripScore;
    }

    ReputationRegistry public immutable reputation;
    RiskPolicyRegistry public immutable policies;
    ThreatSignatureRegistry public immutable threats;

    IRiskEngine public riskEngine;
    uint256 public minReputation;

    mapping(address => PoolState) public pools;
    address[] public registeredPools;

    event PoolRegistered(address indexed pool);
    event RiskEngineSet(address indexed engine);
    event MinReputationSet(uint256 minReputation);
    event ScoreReported(address indexed pool, address indexed agent, uint256 score, bytes32 threatSignature);
    event StateChanged(address indexed pool, BreakerState indexed from, BreakerState indexed to, uint256 blockNumber);
    event BreakerTripped(address indexed pool, bytes32 indexed threatSignature, uint256 score, address indexed agent);

    modifier onlyReputableAgent() {
        if (!reputation.isReputable(msg.sender, minReputation)) revert AgentNotReputable();
        _;
    }

    constructor(
        ReputationRegistry reputation_,
        RiskPolicyRegistry policies_,
        ThreatSignatureRegistry threats_,
        uint256 minReputation_
    ) Ownable(msg.sender) {
        reputation = reputation_;
        policies = policies_;
        threats = threats_;
        minReputation = minReputation_;
    }

    // ── Admin ───────────────────────────────────────────────────────────────
    function registerPool(address pool) external onlyOwner {
        if (pools[pool].registered) revert PoolAlreadyRegistered();
        pools[pool].registered = true;
        registeredPools.push(pool);
        emit PoolRegistered(pool);
    }

    function setRiskEngine(IRiskEngine engine) external onlyOwner {
        riskEngine = engine;
        emit RiskEngineSet(address(engine));
    }

    function setMinReputation(uint256 minReputation_) external onlyOwner {
        minReputation = minReputation_;
        emit MinReputationSet(minReputation_);
    }

    // ── Agent entrypoints ───────────────────────────────────────────────────
    /// @notice Score a feature vector on the on-chain risk engine and feed the
    ///         result through the breaker FSM in one transaction.
    function assessAndReport(address pool, uint256[] calldata features, bytes32 threatSignature)
        external
        onlyReputableAgent
        returns (uint256 score)
    {
        if (address(riskEngine) == address(0)) revert RiskEngineNotSet();
        score = riskEngine.score(features);
        _processReport(pool, score, threatSignature);
    }

    /// @notice Feed an externally computed score through the breaker FSM.
    function reportScore(address pool, uint256 score, bytes32 threatSignature) external onlyReputableAgent {
        _processReport(pool, score, threatSignature);
    }

    /// @notice Permissionless time-based transitions: TRIPPED → COOLDOWN → NORMAL.
    function advance(address pool) external {
        PoolState storage ps = pools[pool];
        if (!ps.registered) revert PoolNotRegistered();
        RiskPolicyRegistry.RiskPolicy memory policy = policies.getPolicy(pool);

        if (ps.state == BreakerState.TRIPPED) {
            if (block.number < ps.trippedAtBlock + policy.cooldownBlocks) revert CooldownNotElapsed();
            ps.cooldownStartBlock = uint64(block.number);
            _setState(pool, ps, BreakerState.COOLDOWN);
        } else if (ps.state == BreakerState.COOLDOWN) {
            if (block.number < ps.cooldownStartBlock + policy.cooldownBlocks) revert CooldownNotElapsed();
            ps.highBlockCount = 0;
            _setState(pool, ps, BreakerState.NORMAL);
        } else {
            revert NotTripped();
        }
    }

    /// @notice Rate-limit accounting while a pool is in the flag zone.
    function recordVolume(address pool, uint256 amount) external returns (uint256) {
        if (!pools[pool].registered) revert PoolNotRegistered();
        return policies.checkAndRecordVolume(pool, amount);
    }

    // ── Views ───────────────────────────────────────────────────────────────
    /// @notice False when the pool's breaker is tripped OR the action matches
    ///         a globally known threat signature — the cross-protocol shield:
    ///         pools are protected from published signatures with no action
    ///         of their own.
    function isActionAllowed(address pool, bytes32 threatSignature) external view returns (bool) {
        PoolState storage ps = pools[pool];
        if (!ps.registered) return true;
        if (ps.state == BreakerState.TRIPPED) return false;
        if (threats.isKnownThreat(threatSignature)) return false;
        return true;
    }

    function getPoolState(address pool) external view returns (PoolState memory) {
        return pools[pool];
    }

    function registeredPoolCount() external view returns (uint256) {
        return registeredPools.length;
    }

    // ── FSM core ────────────────────────────────────────────────────────────
    function _processReport(address pool, uint256 score, bytes32 threatSignature) internal {
        PoolState storage ps = pools[pool];
        if (!ps.registered) revert PoolNotRegistered();
        RiskPolicyRegistry.RiskPolicy memory policy = policies.getPolicy(pool);

        emit ScoreReported(pool, msg.sender, score, threatSignature);

        if (ps.state == BreakerState.NORMAL) {
            if (score >= policy.blockThreshold) {
                ps.lastHighBlock = uint64(block.number);
                ps.highBlockCount = 1;
                _setState(pool, ps, BreakerState.ELEVATED);
                // hysteresis: a first high-score block only elevates; tripping
                // requires the anomaly to sustain across sustainBlocks blocks
                if (ps.highBlockCount >= policy.sustainBlocks) {
                    _trip(pool, ps, score, threatSignature);
                }
            }
        } else if (ps.state == BreakerState.ELEVATED) {
            if (score >= policy.blockThreshold) {
                if (block.number > ps.lastHighBlock) {
                    ps.highBlockCount++;
                    ps.lastHighBlock = uint64(block.number);
                }
                if (ps.highBlockCount >= policy.sustainBlocks) {
                    _trip(pool, ps, score, threatSignature);
                }
            } else if (score < policy.flagThreshold) {
                // anomaly did not sustain — de-escalate without tripping
                ps.highBlockCount = 0;
                _setState(pool, ps, BreakerState.NORMAL);
            }
            // flag zone: hold ELEVATED, neither escalate nor de-escalate
        } else if (ps.state == BreakerState.COOLDOWN) {
            if (score >= policy.blockThreshold) {
                // hysteresis: during cooldown the barrier to re-trip is one block
                _trip(pool, ps, score, threatSignature);
            }
        }
        // TRIPPED: reports are recorded (event) but state only changes via advance()
    }

    function _trip(address pool, PoolState storage ps, uint256 score, bytes32 threatSignature) internal {
        ps.trippedAtBlock = uint64(block.number);
        ps.tripSignature = threatSignature;
        ps.tripScore = uint16(score > type(uint16).max ? type(uint16).max : score);
        _setState(pool, ps, BreakerState.TRIPPED);

        if (threatSignature != bytes32(0) && !threats.isKnownThreat(threatSignature)) {
            threats.publishThreat(threatSignature, 0, ps.tripScore);
        }
        emit BreakerTripped(pool, threatSignature, score, msg.sender);
    }

    function _setState(address pool, PoolState storage ps, BreakerState to) internal {
        BreakerState from = ps.state;
        ps.state = to;
        emit StateChanged(pool, from, to, block.number);
    }
}
