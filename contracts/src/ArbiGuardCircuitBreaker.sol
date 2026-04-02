// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {IArbiGuardTarget} from "./interfaces/IArbiGuardTarget.sol";
import {ThreatTypes} from "./libraries/ThreatTypes.sol";

/// @title ArbiGuardCircuitBreaker
/// @notice Circuit breaker for DeFi pools on Arbitrum with VRF-based defender selection.
/// @dev Implements second-price settlement for coordinated defender responses.
contract ArbiGuardCircuitBreaker is VRFConsumerBaseV2Plus {
    // ── Errors ─────────────────────────────────────────────────────────────
    error PoolNotRegistered();
    error PoolAlreadyPaused();
    error CooldownActive();
    error AlreadySettled();
    error TransferFailed();
    error NotGuardian();

    // ── State ──────────────────────────────────────────────────────────────
    struct PoolConfig {
        bool active;
        bool paused;
        uint256 maxVolumePerBlock;
        uint256 cooldownBlocks;
        uint256 lastTriggerBlock;
    }

    struct DefenseRequest {
        address pool;
        address initiator;
        uint256 bounty;
        bool settled;
    }

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    address public immutable COORDINATOR;
    uint256 public immutable SUBSCRIPTION_ID;
    bytes32 public immutable KEY_HASH;

    mapping(address => PoolConfig) public poolConfigs;
    mapping(uint256 => DefenseRequest) public defenseRequests;
    mapping(address => uint256) public blockVolume;
    mapping(address => uint256) public lastVolumeBlock;
    mapping(address => bool) public guardians;
    mapping(address => address[]) public poolDefenders;

    ThreatTypes.ThreatReport[] public threatHistory;

    // ── Events ─────────────────────────────────────────────────────────────
    event PoolPaused(address indexed pool, address indexed initiator, uint256 blockNum);
    event PoolUnpaused(address indexed pool, address indexed initiator);
    event PoolRateLimited(address indexed pool, uint256 maxVolume, uint256 cooldown);
    event PoolRegistered(address indexed pool);
    event CircuitBreakerTriggered(address indexed pool, uint256 requestId);
    event DefenseSettled(uint256 indexed requestId, address winner, uint256 payout);
    event GuardianAdded(address indexed guardian);
    event GuardianRemoved(address indexed guardian);
    event DefenderRegistered(address indexed pool, address indexed defender);

    // ── Modifiers ──────────────────────────────────────────────────────────
    modifier onlyGuardian() {
        if (!guardians[msg.sender] && msg.sender != owner()) revert NotGuardian();
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────
    constructor(
        address vrfCoordinator,
        uint256 subscriptionId,
        bytes32 keyHash
    ) VRFConsumerBaseV2Plus(vrfCoordinator) {
        COORDINATOR = vrfCoordinator;
        SUBSCRIPTION_ID = subscriptionId;
        KEY_HASH = keyHash;
        guardians[msg.sender] = true;
    }

    // ── Admin ──────────────────────────────────────────────────────────────
    function addGuardian(address guardian) external onlyOwner {
        guardians[guardian] = true;
        emit GuardianAdded(guardian);
    }

    function removeGuardian(address guardian) external onlyOwner {
        guardians[guardian] = false;
        emit GuardianRemoved(guardian);
    }

    function registerPool(address pool) external onlyOwner {
        poolConfigs[pool] = PoolConfig({
            active: true,
            paused: false,
            maxVolumePerBlock: 0,
            cooldownBlocks: 10,
            lastTriggerBlock: 0
        });
        emit PoolRegistered(pool);
    }

    function registerDefender(address pool, address defender) external onlyOwner {
        poolDefenders[pool].push(defender);
        emit DefenderRegistered(pool, defender);
    }

    // ── External Actions ───────────────────────────────────────────────────
    function pausePool(address pool) external payable onlyGuardian returns (uint256 requestId) {
        PoolConfig storage config = poolConfigs[pool];
        if (!config.active) revert PoolNotRegistered();
        if (config.paused) revert PoolAlreadyPaused();
        if (config.lastTriggerBlock > 0 && block.number < config.lastTriggerBlock + config.cooldownBlocks) revert CooldownActive();

        config.paused = true;
        config.lastTriggerBlock = block.number;

        requestId = _requestVRF();
        defenseRequests[requestId] = DefenseRequest({
            pool: pool,
            initiator: msg.sender,
            bounty: msg.value,
            settled: false
        });

        threatHistory.push(ThreatTypes.ThreatReport({
            pool: pool,
            level: ThreatTypes.ThreatLevel.Critical,
            action: ThreatTypes.ActionTaken.Paused,
            blockNumber: block.number,
            reporter: msg.sender
        }));

        emit PoolPaused(pool, msg.sender, block.number);
        emit CircuitBreakerTriggered(pool, requestId);
    }

    function unpausePool(address pool) external onlyGuardian {
        PoolConfig storage config = poolConfigs[pool];
        if (!config.active) revert PoolNotRegistered();
        config.paused = false;
        emit PoolUnpaused(pool, msg.sender);
    }

    function setRateLimit(
        address pool,
        uint256 maxVolumePerBlock,
        uint256 cooldownBlocks
    ) external onlyGuardian {
        PoolConfig storage config = poolConfigs[pool];
        config.active = true;
        config.maxVolumePerBlock = maxVolumePerBlock;
        config.cooldownBlocks = cooldownBlocks;

        threatHistory.push(ThreatTypes.ThreatReport({
            pool: pool,
            level: ThreatTypes.ThreatLevel.High,
            action: ThreatTypes.ActionTaken.RateLimited,
            blockNumber: block.number,
            reporter: msg.sender
        }));

        emit PoolRateLimited(pool, maxVolumePerBlock, cooldownBlocks);
    }

    // ── View ───────────────────────────────────────────────────────────────
    function getPoolConfig(address pool) external view returns (PoolConfig memory) {
        return poolConfigs[pool];
    }

    function getThreatHistoryLength() external view returns (uint256) {
        return threatHistory.length;
    }

    function isPoolPaused(address pool) external view returns (bool) {
        return poolConfigs[pool].paused;
    }

    // ── VRF Fulfillment ────────────────────────────────────────────────────
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        DefenseRequest storage req = defenseRequests[requestId];
        if (req.settled) revert AlreadySettled();
        req.settled = true;

        address winner = _selectDefender(req.pool, randomWords[0]);
        if (winner != address(0) && req.bounty > 0) {
            (bool ok,) = winner.call{value: req.bounty}("");
            if (!ok) revert TransferFailed();
        }

        emit DefenseSettled(requestId, winner, req.bounty);
    }

    // ── Internal ───────────────────────────────────────────────────────────
    function _requestVRF() internal returns (uint256 requestId) {
        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: KEY_HASH,
                subId: SUBSCRIPTION_ID,
                requestConfirmations: 3,
                callbackGasLimit: 200_000,
                numWords: 1,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
                )
            })
        );
    }

    function _selectDefender(
        address pool,
        uint256 randomWord
    ) internal view returns (address) {
        address[] storage defenders = poolDefenders[pool];
        if (defenders.length == 0) {
            return address(0);
        }
        uint256 index = randomWord % defenders.length;
        return defenders[index];
    }

    receive() external payable {}
}
