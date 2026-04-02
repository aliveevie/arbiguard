# ArbiGuard

**AI-Agent Skill for Real-Time DeFi Threat Detection and Autonomous Protective Response on Arbitrum**

ArbiGuard enables AI agents to autonomously detect and respond to DeFi attacks on Arbitrum. It combines a multi-indicator threat scoring engine with an on-chain circuit breaker that can pause or rate-limit pools when threats are detected — no human in the loop required.

---

## Live

**Public Endpoint:** [`https://arbiguard-latest.onrender.com`](https://arbiguard-latest.onrender.com/api/status)

| Contract | Address |
|---|---|
| ArbiGuardCircuitBreaker | [`0xE827C2eF74F67e21c637d3164b3af3bC394cA52F`](https://sepolia.arbiscan.io/address/0xE827C2eF74F67e21c637d3164b3af3bC394cA52F) |
| Agent Identity (ERC-8004) | Agent #156 on [`0x8004A818...`](https://sepolia.arbiscan.io/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |

## What It Does

```
Transaction hits Arbitrum pool
    → ArbiGuard detects it via event subscription
    → 5 threat indicators score the transaction (0-100)
    → Score > 61? Agent calls triggerCircuitBreaker()
    → Pool is paused on-chain, defenders notified via VRF
```

### Skill Actions

| Action | Description |
|---|---|
| `monitorPool` | Subscribe to pool events, classify threats in real-time |
| `assessThreat` | Score a transaction against 5 attack patterns (supports replay mode) |
| `triggerCircuitBreaker` | Execute on-chain pause or rate limit |
| `getProtocolHealth` | Structured health report with alerts and anomalies |
| `registerAgent` | Register on Arbitrum ERC-8004 identity registry |

### Threat Indicators

| Indicator | Weight | What It Detects |
|---|---|---|
| Flash loan | 30 | `flashLoan`/`flashSwap` selectors in call trace + event logs |
| Price deviation | 25 | Spot price > 3σ from TWAP estimate |
| Sandwich attack | 20 | Front-run + back-run by same address in block |
| Reentrancy | 15 | Call depth > 3 with repeated targets |
| Liquidation exploit | 10 | Liquidation + oracle update in same block |

**Supported Protocols:** GMX v2, Camelot DEX, Aave V3

---

## Quick Start

### Prerequisites

- Node.js >= 20
- Foundry (forge, cast)
- pnpm

### Install & Test

```bash
# Install
pnpm install
cd contracts && forge install && cd ..

# Run all tests (23 passing — includes live Arbitrum Sepolia integration tests)
pnpm test

# Run contract tests (12 passing)
cd contracts && forge test -vvv
```

### Run the Server

```bash
cp .env.example .env
# Edit .env with your RPC URLs

pnpm build
pnpm start
# → http://localhost:3000/api/status
```

### Try It

```bash
# Assess a known exploit against the live endpoint
curl -X POST https://arbiguard-latest.onrender.com/api/assess \
  -H "Content-Type: application/json" \
  -d '{
    "txHash": "0x0000000000000000000000000000000000000000000000000000000000000001",
    "network": "arbitrum_one",
    "replayMode": true,
    "replayId": "radiant_flashloan_2024"
  }'
```

### Run the Agent Demo

```bash
# Full autonomous agent cycle — hits live Arbitrum Sepolia
pnpm demo
```

This runs the complete agent workflow: verifies identity registration, replays 3 historical Arbitrum exploits, demonstrates autonomous threat response decisions, and generates a protocol health report — all against live on-chain data.

### Deploy Your Own (Arbitrum Sepolia)

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

---

## Deploy as Public Endpoint

### Docker

```bash
docker build -t arbiguard .
docker run -p 3000:3000 \
  -e ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc \
  arbiguard
```

### Render (one-click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

Uses the included `render.yaml`. Set your `ARBITRUM_SEPOLIA_RPC_URL` in the Render dashboard.

### Railway

```bash
railway login
railway init
railway up
```

---

## Test Results

```
Solidity (Foundry):  12/12 passing
TypeScript (Vitest): 23/23 passing
  - Unit tests:        12 passing
  - Replay tests:       4 passing
  - Live integration:   7 passing (Arbitrum Sepolia)
```

---

## Architecture

See [SKILL.md](./SKILL.md) for the full architecture document, data flow diagrams, API reference, and security considerations.

## License

MIT
