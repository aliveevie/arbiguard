# ArbiGuard Skill

### AI-Agent Skill for Real-Time DeFi Threat Detection and Autonomous Protective Response on Arbitrum

---

## Overview

ArbiGuard is a composable AI agent skill that enables autonomous threat detection and protective response against DeFi attacks on Arbitrum. The skill wraps a deployed circuit breaker contract (based on the IC3 Prrr mechanism) with a TypeScript agent interface, exposing callable actions for pool monitoring, transaction threat assessment, on-chain health reporting, and automated circuit breaker execution.

**What makes ArbiGuard unique:** Unlike generic monitoring tools, ArbiGuard combines five weighted threat indicators (flash loan detection, price deviation analysis, sandwich attack patterns, reentrancy depth analysis, and liquidation correlation) into a single composable skill that any AI agent framework can invoke. It can autonomously pause or rate-limit a pool when a threat exceeds configurable thresholds — no human in the loop required.

**Target Protocols:** GMX v2 (Arbitrum One / Sepolia), Camelot DEX, Aave V3 Arbitrum

**Agent Framework Compatibility:** Any framework that can invoke a TypeScript module or HTTP endpoint — including ElizaOS, OpenClaw, Pi.dev agent extensions, and custom orchestrators.

---

## Deployed Contracts

| Contract | Network | Address |
|---|---|---|
| ArbiGuardCircuitBreaker | Arbitrum Sepolia | [`0xE827C2eF74F67e21c637d3164b3af3bC394cA52F`](https://sepolia.arbiscan.io/address/0xE827C2eF74F67e21c637d3164b3af3bC394cA52F) |
| Agent Identity (ERC-8004) | Arbitrum Sepolia | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://sepolia.arbiscan.io/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| Agent ID | Arbitrum Sepolia | **156** (0x9c) |
| Chainlink VRF Coordinator | Arbitrum Sepolia | `0x5CE8D5A2BC84beb22a398CCA51996F7930313D61` |

**Live Endpoint:** [`https://arbiguard-latest.onrender.com`](https://arbiguard-latest.onrender.com/api/status)

**Deployer / Agent Owner:** `0x6563F945530132a0BacBFD772b79f127ef3Af339`

---

## Architecture

```
+-----------------------------------------------------------------+
|                        AI AGENT LAYER                           |
|   (ElizaOS / OpenClaw / Pi.dev / Custom Orchestrator)           |
+-------------------------------+---------------------------------+
                                | calls skill actions
                                v
+-----------------------------------------------------------------+
|                     ARBIGUARD SKILL LAYER                       |
|                                                                 |
|  +---------------+ +---------------+ +----------------------+  |
|  | monitor_pool  | | assess_threat | | get_protocol_health  |  |
|  +---------------+ +---------------+ +----------------------+  |
|  +------------------------+ +--------------------------------+  |
|  | trigger_circuit_break  | | register_agent                 |  |
|  +------------------------+ +--------------------------------+  |
+-------+-----------------------------------+---------------------+
        | reads events / RPC calls          | writes transactions
        v                                   v
+-------------------+             +-----------------------------+
|  DETECTION ENGINE |             |   ARBITRUM SMART CONTRACTS  |
|                   |             |                             |
|  - Trace Parser   |             |  ArbiGuardCircuitBreaker    |
|  - Event Analyzer |             |  - pausePool()             |
|  - 5 Indicator    |             |  - setRateLimit()          |
|    Scorers        |             |  - VRF defender selection   |
|  - Replay Mode    |             |  - Threat history          |
+-------------------+             +-----------------------------+
        |                                   |
        v                                   v
+-------------------+             +-----------------------------+
|  ARBITRUM NODE    |             |  AGENT IDENTITY REGISTRY    |
|  (RPC / WS)      |             |  ERC-8004 (Agent #156)      |
+-------------------+             +-----------------------------+
```

---

## Skill Actions

### 1. `monitorPool` — Real-Time Pool Surveillance

Subscribes to block events and analyzes every transaction touching a target pool. Flags or blocks threats automatically.

```typescript
const session = await monitorPool({
  poolAddress: "0x...",
  protocol: "gmx_v2",
  network: "arbitrum_sepolia",
  callbackUrl: "https://my-agent/webhook",  // optional
});
// Returns: { sessionId, status: "active", subscribedEvents: [...] }
```

### 2. `assessThreat` — Transaction Threat Scoring

Scores a specific transaction against five attack pattern indicators. Supports replay mode for testing against historical Arbitrum exploits.

```typescript
// Live mode - analyze a real transaction
const result = await assessThreat({
  txHash: "0xabc...",
  network: "arbitrum_one",
});

// Replay mode - test against known exploit
const replay = await assessThreat({
  txHash: "0x...",
  network: "arbitrum_one",
  replayMode: true,
  replayId: "gmx_oracle_manipulation_2022",
});
```

**Response:**
```json
{
  "txHash": "0x...",
  "threatScore": 82,
  "threatType": "flash_loan_abuse",
  "confidence": 0.91,
  "indicators": [
    {
      "type": "flash_loan_initiation",
      "severity": "high",
      "description": "Flash loan selector detected in call trace",
      "onChainEvidence": "trace.calls[2].input starts with 0x5cffe9de"
    }
  ],
  "recommendation": "block",
  "assessedAt": 1743700000
}
```

### 3. `triggerCircuitBreaker` — On-Chain Emergency Response

Executes `pausePool()` or `setRateLimit()` on the deployed circuit breaker contract. Triggers Chainlink VRF for randomized defender selection.

```typescript
const result = await triggerCircuitBreaker({
  poolAddress: "0x...",
  network: "arbitrum_sepolia",
  action: "pause",
  signerPrivateKey: process.env.AGENT_PRIVATE_KEY,
});
// Returns: { success: true, txHash: "0x...", blockNumber: 255685908 }
```

### 4. `getProtocolHealth` — Protocol Health Report

Returns structured health data including TVL, active alerts, recent anomalies, and circuit breaker status by scanning on-chain events.

```typescript
const health = await getProtocolHealth({
  protocol: "gmx_v2",
  network: "arbitrum_sepolia",
  lookbackBlocks: 1000,
});
```

### 5. `registerAgent` — Agent Identity Registration

Registers the agent on the Arbitrum ERC-8004 identity registry.

```typescript
const reg = await registerAgent({
  agentName: "ArbiGuard",
  agentVersion: "1.0.0",
  metadataUri: "ipfs://...",
  signerPrivateKey: process.env.AGENT_PRIVATE_KEY,
  network: "arbitrum_sepolia",
});
// Returns: { success: true, agentId: "0x9c", txHash: "0x..." }
```

---

## Threat Detection Engine

### How It Works

The detection engine scores transactions using five weighted indicators. Each indicator analyzes different attack vectors:

| Indicator | Weight | Detection Method |
|---|---|---|
| Flash loan initiation | 30 | Trace call graph + event log analysis for `flashLoan`/`flashSwap` selectors |
| Price deviation > 3σ | 25 | Compare value transfer patterns and contract interaction complexity |
| Sandwich attack | 20 | Same-block buy/sell pattern detection from block transaction ordering |
| Reentrancy depth > 3 | 15 | Call trace depth analysis with repeated target detection |
| Liquidation correlation | 10 | Cross-reference liquidation events with oracle updates in same block |

**Score Thresholds:**
- `0-30` → **allow** (normal transaction)
- `31-60` → **flag** (alert agent, log for review)
- `61-100` → **block** (recommend circuit breaker activation)

### Live Trace Analysis

When `debug_traceTransaction` is available (Alchemy/QuickNode), the engine performs full call tree analysis:

```
Transaction → debug_traceTransaction (callTracer)
    → Flatten call frames into (calldata[], depths[], targets[])
    → Run all 5 indicator scorers
    → Aggregate weighted score
    → Classify threat type
    → Return recommendation
```

When debug is unavailable (public RPCs), the engine falls back to:
- Event log analysis for flash loan/liquidation signatures
- ERC20 Transfer event volume analysis
- Gas usage ratio heuristics
- Block transaction ordering for sandwich detection

### Replay Mode

Pre-loaded replays of real Arbitrum exploits for testing and demonstration:

| Replay ID | Event | Threat Type |
|---|---|---|
| `gmx_oracle_manipulation_2022` | GMX oracle price manipulation | price_manipulation |
| `camelot_flash_drain_2023` | Camelot flash loan pool drain | flash_loan_abuse |
| `radiant_flashloan_2024` | Radiant Capital flash loan exploit | flash_loan_abuse |

---

## Smart Contract: ArbiGuardCircuitBreaker

The circuit breaker contract implements:

- **Pool pause/unpause** with guardian role-based access control
- **Rate limiting** with configurable per-block volume caps and cooldown periods
- **Chainlink VRF v2.5** for randomized defender selection (anti-collusion)
- **Second-price settlement** for coordinated defender bounty payouts
- **Threat history** — on-chain log of all defensive actions taken
- **Defender registry** — per-pool list of registered defenders

### Key Functions

```solidity
function pausePool(address pool) external payable onlyGuardian returns (uint256 requestId)
function unpausePool(address pool) external onlyGuardian
function setRateLimit(address pool, uint256 maxVolumePerBlock, uint256 cooldownBlocks) external onlyGuardian
function registerPool(address pool) external onlyOwner
function registerDefender(address pool, address defender) external onlyOwner
function addGuardian(address guardian) external onlyOwner
```

---

## HTTP API

The skill exposes a REST API for remote agent invocation:

| Method | Endpoint | Action |
|---|---|---|
| `POST` | `/api/monitor` | Start pool monitoring |
| `DELETE` | `/api/monitor/:sessionId` | Stop monitoring |
| `POST` | `/api/assess` | Assess transaction threat |
| `POST` | `/api/breaker` | Trigger circuit breaker |
| `GET` | `/api/health/:protocol` | Protocol health report |
| `GET` | `/api/status` | Server status + contract info |

### Live Example

```bash
curl -X POST https://arbiguard-latest.onrender.com/api/assess \
  -H "Content-Type: application/json" \
  -d '{
    "txHash": "0x...",
    "network": "arbitrum_sepolia",
    "replayMode": true,
    "replayId": "radiant_flashloan_2024"
  }'
```

---

## Test Results

### Solidity (Foundry) — 12/12 passing

```
test_AddGuardian()                 PASS
test_CooldownEnforced()            PASS
test_GetPoolConfig()               PASS
test_PausePool()                   PASS
test_RegisterDefender()            PASS
test_RegisterPool()                PASS
test_RemoveGuardian()              PASS
test_RevertPausePool_NotGuardian() PASS
test_RevertPausePool_NotRegistered() PASS
test_SetRateLimit()                PASS
test_ThreatHistory()               PASS
test_UnpausePool()                 PASS
```

### TypeScript (Vitest) — 23/23 passing

```
Unit Tests:
  - Detection engine scoring (7 tests)
  - Action interfaces (5 tests)
  - Replay assessments (4 tests)

Live Integration Tests (Arbitrum Sepolia):
  - Contract exists and has code              PASS
  - Owner is the deployer                     PASS
  - VRF coordinator is set correctly          PASS
  - Owner is a guardian                       PASS
  - Pool config verified on-chain             PASS
  - Threat history has entries                PASS
  - Agent is registered on identity registry  PASS
```

---

## On-Chain Proof

### Deployment Transaction
- **Tx:** [`0x...`](https://sepolia.arbiscan.io/address/0xE827C2eF74F67e21c637d3164b3af3bC394cA52F) (ArbiGuardCircuitBreaker)

### Agent Registration Transaction
- **Tx:** `0xbca7c82d6e38338a76b49a85cd2ce6c7727023204a8fbea28fe5096cee22678c`
- **Agent ID:** 156 on ERC-8004 registry

### Integration Test Transactions
- Pool registered: `0x35337adc7e25431bfb8100689f4d95781076a6f6450789e560fd430a948c893a`
- Guardian added: `0x98df522ea02aa9443eb4658da11f9a3591ce7ea9ed135b8a9e3b0cd7e28c0097`
- Rate limit set: `0x4000bf0391904ef3f94a135316b446a8e1c9a58a08cd11fb404a5da20e23e8f0`
- Defenders registered: `0x52f45caec39d0af00355861448e4981651aeb2f07e590d61de10d6798c6eb6c4`
- Agent URI set: `0x859be37f682c35f5f77d63eb4cd7bc329c9bb9052f793cf3d30fd298a48a1513`

---

## Directory Structure

```
arbiguard/
├── SKILL.md                              # This document
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
│
├── contracts/                            # Foundry smart contracts
│   ├── src/
│   │   ├── ArbiGuardCircuitBreaker.sol   # Main circuit breaker
│   │   ├── interfaces/
│   │   │   └── IArbiGuardTarget.sol
│   │   └── libraries/
│   │       └── ThreatTypes.sol
│   ├── test/
│   │   └── ArbiGuardCircuitBreaker.t.sol # 12 passing tests
│   ├── script/
│   │   └── Deploy.s.sol
│   └── foundry.toml
│
├── skill/                                # TypeScript skill layer
│   ├── index.ts                          # Skill entry point
│   ├── actions/
│   │   ├── monitorPool.ts
│   │   ├── assessThreat.ts
│   │   ├── triggerCircuitBreaker.ts
│   │   ├── getProtocolHealth.ts
│   │   └── registerAgent.ts
│   ├── detection/
│   │   ├── engine.ts                     # Threat scoring orchestrator
│   │   ├── indicators/
│   │   │   ├── flashLoan.ts
│   │   │   ├── sandwich.ts
│   │   │   ├── priceDeviation.ts
│   │   │   ├── reentrancy.ts
│   │   │   └── liquidation.ts
│   │   └── replays/
│   │       ├── index.ts
│   │       └── *.json                    # 3 historical exploit replays
│   ├── contracts/
│   │   ├── abi/
│   │   │   └── ArbiGuardCircuitBreaker.json
│   │   └── client.ts                     # Viem client helpers
│   └── types/
│       └── index.ts
│
├── server/                               # Express HTTP wrapper
│   ├── index.ts
│   └── routes/
│       ├── monitor.ts
│       ├── assess.ts
│       ├── breaker.ts
│       └── health.ts
│
└── test/                                 # 23 passing tests
    ├── actions/
    │   ├── assessThreat.test.ts
    │   └── monitorPool.test.ts
    ├── detection/
    │   ├── engine.test.ts
    │   └── liveAssess.test.ts
    └── integration/
        └── liveContract.test.ts          # Live Arbitrum Sepolia tests
```

---

## Dependencies

**Smart Contracts:** Foundry, OpenZeppelin Contracts v5, Chainlink VRF v2.5

**Skill / Server:** TypeScript 5.x, Viem v2, Express v4, Zod, Vitest

---

## Security Considerations

- **Agent keys** should use session keys or dedicated EOAs with limited permissions (ERC-7715)
- **RPC trust** — `debug_traceTransaction` requires Alchemy/QuickNode with debug namespaces; public RPCs fall back to event-based analysis
- **False positive mitigation** — 3σ TWAP threshold is configurable per-pool; replay mode allows calibration
- **Circuit breaker authorization** — `pausePool` requires `GUARDIAN_ROLE`; deployer assigns via `addGuardian()`
- **Replay mode isolation** — operates on archived mock data, submits zero transactions

---

## License

MIT
