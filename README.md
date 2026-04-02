# ArbiGuard

AI-powered DeFi threat detection and autonomous circuit-breaker response for Arbitrum.

[Live UI Chat Agent](https://arbiguard-latest.onrender.com/)
|
[Repository](https://github.com/aliveevie/arbiguard)

## Overview

ArbiGuard is a full-stack security agent that monitors DeFi activity on Arbitrum, scores suspicious transactions against multiple exploit indicators, and can trigger an on-chain circuit breaker when risk crosses a blocking threshold.

The project combines:

- a TypeScript threat-detection skill
- an Express API and chat agent
- a React frontend for interactive chat
- a Solidity circuit-breaker contract with Chainlink VRF integration
- replay datasets for historical exploit simulations

## What It Does

ArbiGuard is designed to help an operator, agent framework, or UI do four things:

1. Assess a live transaction on Arbitrum.
2. Replay known exploit patterns offline using curated fixtures.
3. Monitor a pool continuously and flag suspicious activity.
4. Execute a defensive action on-chain by pausing or rate-limiting a pool.

### Threat Indicators

The detection engine scores each transaction using five weighted signals:

| Indicator | Weight | Purpose |
| --- | ---: | --- |
| Flash loan initiation | 30 | Detects flash-loan or flash-swap call signatures in traces and logs |
| Price deviation | 25 | Flags large spot-vs-TWAP style deviations from execution heuristics |
| Sandwich attack | 20 | Detects same-sender front-run / back-run patterns around a victim tx |
| Reentrancy depth | 15 | Detects repeated targets at suspicious call depth |
| Liquidation correlation | 10 | Flags liquidation activity aligned with oracle updates |

### Recommendations

| Score | Result |
| --- | --- |
| `0-30` | `allow` |
| `31-60` | `flag` |
| `61-100` | `block` |

## Live Links

- Live UI chat agent: https://arbiguard-latest.onrender.com/
- Live status endpoint: https://arbiguard-latest.onrender.com/api/status
- GitHub repository: https://github.com/aliveevie/arbiguard

## 3D Architecture View

```text
                  ________________________________
                 /                               /|
                /   React Chat UI               / |
               /   arbiguard-ui                 /  |
              /_______________________________ /   |
              |  quick actions, markdown chat |    |
              |  API proxy to Express         |    |
              |_______________________________|    |
              |                               |    |
              |   Express API + Agent Router  |   /
              |   server/                     |  /
              |_______________________________| /
              |  /api/chat                    |/
              |  /api/assess
              |  /api/monitor
              |  /api/breaker
              |  /api/health
              |________________________________
                           |
                           v
                  ________________________________
                 /                               /|
                /   Skill + Detection Engine    / |
               /   skill/                       /  |
              /_______________________________ /   |
              | replay mode                    |    |
              | live tx analysis               |    |
              | scoring + recommendations      |    |
              |________________________________|   /
                           |                     |  /
                           |                     | /
                           v                     |/
        ____________________________________    ______________________________
       /                                   /|  /                             /|
      /  Arbitrum RPC / Event Data        / | /  ArbiGuardCircuitBreaker    / |
     /___________________________________/  |/  contracts/                  /  |
     | blocks, receipts, traces, logs    |  /______________________________/   |
     |___________________________________| /  pause, rate limit, threat log |  |
                                          |/  Chainlink VRF defender flow    | /
                                          /__________________________________|/
```

## Main Components

### 1. Skill Layer

The reusable skill lives in [`skill/`](./skill) and exposes these actions:

- `assessThreat`
- `monitorPool`
- `triggerCircuitBreaker`
- `getProtocolHealth`
- `registerAgent`

The skill can operate in:

- live mode, using RPC data from Arbitrum
- replay mode, using bundled exploit fixtures

### 2. API and Chat Agent

The Express server in [`server/`](./server) exposes REST endpoints and a chat-driven interface.

The agent supports intent-style requests such as:

- replaying historical exploits
- checking protocol health
- showing circuit-breaker status
- monitoring a pool
- showing threat history
- assessing a specific transaction hash

OpenAI is optional. If `OPENAI_API_KEY` is set, the chat route can resolve broader free-form prompts. Without it, the deterministic intent parser still supports the main command flows.

### 3. Frontend

The React app in [`arbiguard-ui/`](./arbiguard-ui) is a chat UI for interacting with the agent. It includes:

- a conversation layout
- quick command chips
- markdown-safe responses
- Vite proxying to the local API during development

The production bundle is emitted into [`public/`](./public), which the Express server serves directly.

### 4. Smart Contracts

The Solidity package in [`contracts/`](./contracts) contains:

- `ArbiGuardCircuitBreaker.sol`
- Foundry tests
- a deployment script
- vendored `forge-std`, OpenZeppelin, and Chainlink dependencies

The circuit breaker supports:

- pool registration
- guardian-controlled pause / unpause
- pool rate limiting
- threat history tracking
- VRF-based defender selection and settlement

## Historical Replay Dataset

ArbiGuard ships with replay fixtures in [`skill/detection/replays/`](./skill/detection/replays):

| Replay ID | Scenario |
| --- | --- |
| `gmx_oracle_manipulation_2022` | GMX oracle manipulation replay |
| `camelot_flash_drain_2023` | Camelot flash-loan drain replay |
| `radiant_flashloan_2024` | Radiant flash-loan exploit replay |

These are used by the CLI demo, tests, and chat agent.

## Tech Stack

- TypeScript
- Node.js
- Express
- OpenAI SDK
- Viem
- Zod
- React
- Vite
- Tailwind CSS
- Vitest
- Solidity
- Foundry
- Chainlink VRF

## Project Structure

```text
arbiguard/
├── arbiguard-ui/        # React chat frontend
├── contracts/           # Solidity contracts, tests, deploy script
├── demo/                # End-to-end demo script
├── public/              # Built frontend served by Express
├── server/              # API server, chat agent, env loading, LLM routing
├── skill/               # Threat detection engine and actions
├── test/                # Vitest suites for skill and live integrations
├── Dockerfile
├── render.yaml
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Foundry (`forge`, `cast`)

### 1. Install Dependencies

```bash
pnpm install
cd contracts && forge install && cd ..
```

### 2. Configure Environment

Create a local env file from the example:

```bash
cp .env.example .env
```

Core variables used by the app:

```bash
ARBITRUM_ONE_RPC_URL=
ARBITRUM_SEPOLIA_RPC_URL=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

Additional variables used for on-chain writes and contract deployment:

```bash
AGENT_PRIVATE_KEY=
DEPLOYER_PRIVATE_KEY=
CHAINLINK_VRF_SUBSCRIPTION_ID=
CHAINLINK_VRF_KEY_HASH=
```

### 3. Run the API Server

```bash
pnpm dev
```

This starts the Express app on `http://localhost:3000`.

### 4. Run the Frontend in Development

In a second terminal:

```bash
pnpm --dir arbiguard-ui install
pnpm --dir arbiguard-ui dev
```

The frontend runs on `http://localhost:8080` and proxies API calls to the local Express server.

### 5. Build for Production

```bash
pnpm build
pnpm start
```

This builds:

- the React app into `public/`
- the TypeScript server into `dist/`

## Available Scripts

### Root

```bash
pnpm dev
pnpm build
pnpm start
pnpm test
pnpm skill:register
pnpm demo
```

### Frontend

```bash
pnpm --dir arbiguard-ui dev
pnpm --dir arbiguard-ui build
pnpm --dir arbiguard-ui test
```

### Contracts

```bash
cd contracts
forge test -vvv
forge script script/Deploy.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
```

## REST API

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/chat` | Chat with the ArbiGuard agent |
| `POST` | `/api/assess` | Score a transaction threat |
| `POST` | `/api/monitor` | Start monitoring a pool |
| `DELETE` | `/api/monitor/:sessionId` | Stop a monitoring session |
| `POST` | `/api/breaker` | Pause or rate-limit a pool |
| `GET` | `/api/health/:protocol` | Protocol health report |
| `GET` | `/api/status` | Service and deployment status |

### Example: Threat Assessment

```bash
curl -X POST http://localhost:3000/api/assess \
  -H "Content-Type: application/json" \
  -d '{
    "txHash": "0x0000000000000000000000000000000000000000000000000000000000000001",
    "network": "arbitrum_one",
    "replayMode": true,
    "replayId": "radiant_flashloan_2024"
  }'
```

### Example: Chat Agent

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "replay the radiant exploit"
  }'
```

## Example Chat Prompts

- `replay the radiant exploit`
- `show me all exploits`
- `check gmx health`
- `show circuit breaker status`
- `show threat history`
- `assess 0x...`
- `monitor pool 0x...`
- `stop monitoring`
- `who are you?`

## Testing

The repository includes:

- Vitest coverage for the detection engine and skill actions
- live-read integration tests against Arbitrum Sepolia
- Foundry tests for the circuit-breaker contract

Run the TypeScript suite:

```bash
pnpm test
```

Run the Solidity suite:

```bash
cd contracts && forge test -vvv
```

## Deployment

### Docker

```bash
docker build -t arbiguard .
docker run -p 3000:3000 --env-file .env arbiguard
```

### Render

This repository includes [`render.yaml`](./render.yaml) for deployment on Render.

### Live Deployment

- UI: https://arbiguard-latest.onrender.com/
- API status: https://arbiguard-latest.onrender.com/api/status

## Why This Repo Is Useful

ArbiGuard is not just a contract repo and not just a frontend demo. It is a full reference implementation for:

- agentic transaction analysis
- DeFi exploit replay simulation
- AI-assisted security operations
- chat-based operational tooling
- smart-contract-backed defensive automation

## License

MIT
