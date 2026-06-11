// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title RiskPolicyRegistry
/// @notice EIP-712 signed risk policies. A pool's designated risk officer
///         signs the policy off-chain (thresholds, hysteresis parameters,
///         rate limits); anyone may submit it on-chain with the signature.
///         The firewall consults the registered policy to decide
///         allow / rate-limit / block for a given risk score.
contract RiskPolicyRegistry is Ownable, EIP712 {
    error PolicyNotRegistered();
    error InvalidSigner();
    error PolicyExpired();
    error InvalidNonce();
    error NoRiskOfficer();
    error InvalidThresholds();
    error NotConsumer();
    error VolumeExceeded(uint256 attempted, uint256 limit);

    enum Action {
        Allow,
        RateLimit,
        Block
    }

    struct RiskPolicy {
        address pool;
        uint16 flagThreshold; // score >= flagThreshold  → rate-limit zone
        uint16 blockThreshold; // score >= blockThreshold → block zone
        uint32 sustainBlocks; // distinct high-score blocks required to trip the breaker
        uint32 cooldownBlocks; // blocks per cooldown stage after a trip
        uint256 maxVolumePerBlock; // volume cap while rate-limited
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 public constant POLICY_TYPEHASH = keccak256(
        "RiskPolicy(address pool,uint16 flagThreshold,uint16 blockThreshold,uint32 sustainBlocks,uint32 cooldownBlocks,uint256 maxVolumePerBlock,uint256 nonce,uint256 deadline)"
    );

    mapping(address => address) public riskOfficerOf;
    mapping(address => uint256) public nonces;
    mapping(address => RiskPolicy) private _policies;
    mapping(address => bool) public hasPolicy;
    mapping(address => bool) public consumers;

    // per-block volume accounting for rate limiting
    mapping(address => uint256) public blockVolume;
    mapping(address => uint256) public lastVolumeBlock;

    event RiskOfficerSet(address indexed pool, address indexed officer);
    event PolicyRegistered(address indexed pool, address indexed signer, uint16 flagThreshold, uint16 blockThreshold);
    event ConsumerSet(address indexed consumer, bool authorized);
    event VolumeRecorded(address indexed pool, uint256 amount, uint256 blockTotal);

    constructor() Ownable(msg.sender) EIP712("ArbiGuard Risk Policy", "1") {}

    // ── Admin ───────────────────────────────────────────────────────────────
    function setRiskOfficer(address pool, address officer) external onlyOwner {
        riskOfficerOf[pool] = officer;
        emit RiskOfficerSet(pool, officer);
    }

    function setConsumer(address consumer, bool authorized) external onlyOwner {
        consumers[consumer] = authorized;
        emit ConsumerSet(consumer, authorized);
    }

    // ── EIP-712 policy registration ─────────────────────────────────────────
    function hashPolicy(RiskPolicy calldata policy) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    POLICY_TYPEHASH,
                    policy.pool,
                    policy.flagThreshold,
                    policy.blockThreshold,
                    policy.sustainBlocks,
                    policy.cooldownBlocks,
                    policy.maxVolumePerBlock,
                    policy.nonce,
                    policy.deadline
                )
            )
        );
    }

    function registerPolicy(RiskPolicy calldata policy, bytes calldata signature) external {
        address officer = riskOfficerOf[policy.pool];
        if (officer == address(0)) revert NoRiskOfficer();
        if (block.timestamp > policy.deadline) revert PolicyExpired();
        if (policy.nonce != nonces[policy.pool]) revert InvalidNonce();
        if (policy.flagThreshold == 0 || policy.blockThreshold <= policy.flagThreshold) revert InvalidThresholds();
        if (policy.sustainBlocks == 0) revert InvalidThresholds();

        address signer = ECDSA.recover(hashPolicy(policy), signature);
        if (signer != officer) revert InvalidSigner();

        nonces[policy.pool]++;
        _policies[policy.pool] = policy;
        hasPolicy[policy.pool] = true;
        emit PolicyRegistered(policy.pool, signer, policy.flagThreshold, policy.blockThreshold);
    }

    function getPolicy(address pool) external view returns (RiskPolicy memory) {
        if (!hasPolicy[pool]) revert PolicyNotRegistered();
        return _policies[pool];
    }

    // ── Enforcement ─────────────────────────────────────────────────────────
    /// @notice Map a risk score to the policy's enforcement zone.
    function enforcementAction(address pool, uint256 score) public view returns (Action) {
        if (!hasPolicy[pool]) revert PolicyNotRegistered();
        RiskPolicy storage p = _policies[pool];
        if (score >= p.blockThreshold) return Action.Block;
        if (score >= p.flagThreshold) return Action.RateLimit;
        return Action.Allow;
    }

    /// @notice Rate-limit accounting: authorized consumers (the firewall)
    ///         record volume; reverts when the per-block cap is exceeded.
    function checkAndRecordVolume(address pool, uint256 amount) external returns (uint256 blockTotal) {
        if (!consumers[msg.sender]) revert NotConsumer();
        if (!hasPolicy[pool]) revert PolicyNotRegistered();

        if (lastVolumeBlock[pool] != block.number) {
            lastVolumeBlock[pool] = block.number;
            blockVolume[pool] = 0;
        }
        blockTotal = blockVolume[pool] + amount;
        uint256 limit = _policies[pool].maxVolumePerBlock;
        if (limit != 0 && blockTotal > limit) revert VolumeExceeded(blockTotal, limit);

        blockVolume[pool] = blockTotal;
        emit VolumeRecorded(pool, amount, blockTotal);
    }
}
