# ArbiGuard

**An institutional-grade on-chain firewall for tokenized real-world assets on Arbitrum and Robinhood Chain.**

[Live UI Chat Agent](https://arbiguard-latest.onrender.com/)
|
[Repository](https://github.com/aliveevie/arbiguard)

## Why

Tokenized equities, treasuries, and funds are moving on-chain — Robinhood Chain alone is built to carry tokenized stocks for millions of retail accounts. Institutions bringing these assets on-chain inherit DeFi's attack surface (flash-loan drains, oracle manipulation, sandwich extraction) without DeFi's appetite for risk: a single exploited market is a regulatory event, not just a bad day.

ArbiGuard is the firewall layer those venues are missing. It scores every suspicious transaction against known exploit signatures, enforces risk policies that a compliance officer has cryptographically signed, and — when an attack pattern sustains — trips an on-chain circuit breaker autonomously and immunizes every other protected market against the same pattern.

## How it works

```
 off-chain agent                          on-chain (Arbitrum / Robinhood Chain)
┌─────────────────────┐   feature      ┌─────────────────────────────────────┐
│ detection engine     │   vector      │ RiskEngine (Stylus / Solidity)      │
│ traces, prices,      ├──────────────►│ deterministic score 0-100           │
│ events, mempool      │               └──────────────┬──────────────────────┘
└─────────────────────┘                               │ score
                                       ┌──────────────▼──────────────────────┐
   risk officer signs                  │ ArbiGuardFirewall                   │
   policy off-chain                    │ hysteresis breaker FSM              │
┌─────────────────────┐   EIP-712     │  NORMAL → ELEVATED → TRIPPED        │
│ RiskPolicyRegistry   │◄──────────────┤        ↖ COOLDOWN ↙                │
│ thresholds, limits   ├──────────────►│ thresholds from signed policy       │
└─────────────────────┘                └───────┬─────────────────┬───────────┘
                                               │ gate            │ on trip
                                  ┌────────────▼─────┐  ┌────────▼───────────┐
                                  │ ReputationRegistry│  │ ThreatSignature    │
                                  │ (ERC-8004 style)  │  │ Registry           │
                                  │ only proven agents│  │ write-once intel,  │
                                  │ can trip breakers │  │ read by all pools  │
                                  └──────────────────┘  └────────────────────┘
```

1. **One scoring engine, three implementations, bit-identical.** The detection engine reduces a transaction to a canonical 8-element feature vector (flash-loan selectors, spot/TWAP deviation in fixed-point, sandwich bracketing, call-depth shape, liquidation/oracle correlation). The TypeScript engine (`skill/detection/`), the **Arbitrum Stylus engine in Rust** (`contracts-stylus/`), and the Solidity reference engine (`contracts/src/RiskEngineSolidity.sol`) produce the same score for the same vector — proven by parity tests in all three test suites against three historical Arbitrum exploits (GMX 2022, Camelot 2023, Radiant 2024).
2. **Signed risk policy, not admin keys.** A pool's risk officer signs an EIP-712 `RiskPolicy` (allow / rate-limit / block thresholds, sustain and cooldown windows, per-block volume caps). Anyone can submit the signed policy; nobody can forge one. Enforcement zones come from the registered policy, never from a privileged caller's judgment.
3. **Hysteresis breaker — no single-block panic.** Risk reports drive a per-pool FSM: `NORMAL → ELEVATED → TRIPPED → COOLDOWN`. Tripping requires the anomaly to sustain across distinct blocks (policy-defined), so one weird block can never halt an institutional market — but during cooldown the re-trip barrier drops to a single block.
4. **Reputation-gated agents (ERC-8004 style).** Only agents registered in the identity registry with sufficient accumulated reputation can feed the breaker. A fresh address — or a slashed agent — cannot touch protective controls.
5. **Shared threat intelligence.** A trip publishes the exploit's signature to a write-once registry. Every other registered pool is immediately shielded from that signature with **no transaction of its own** — the first victim's detection becomes everyone's immunity.

## Deployments

| Network | Chain ID | Contract | Address |
| --- | --- | --- | --- |
| Arbitrum Sepolia | 421614 | RiskEngine (Stylus, Rust/WASM) | _deploying — see `deployments/421614.json`_ |
| Arbitrum Sepolia | 421614 | ArbiGuardFirewall | _deploying — see `deployments/421614.json`_ |
| Arbitrum Sepolia | 421614 | RiskPolicyRegistry | _deploying — see `deployments/421614.json`_ |
| Arbitrum Sepolia | 421614 | ReputationRegistry | _deploying — see `deployments/421614.json`_ |
| Arbitrum Sepolia | 421614 | ThreatSignatureRegistry | _deploying — see `deployments/421614.json`_ |
| Robinhood Chain Testnet | 46630 | ArbiGuardFirewall + registries | _deploying — see `deployments/46630.json`_ |

Live agent UI: **https://arbiguard-latest.onrender.com/** · Status: https://arbiguard-latest.onrender.com/api/status

## Threat model

The engine scores five weighted indicators; the zones are enforced on-chain from the signed policy:

| Indicator | Weight | Detects |
| --- | ---: | --- |
| Flash loan initiation | 30 | flash-loan / flash-swap selectors in the call trace |
| Price deviation | 25 | spot vs TWAP deviation beyond 3σ (fixed-point, on-chain) |
| Sandwich attack | 20 | same-sender front-run / back-run bracketing a victim |
| Reentrancy depth | 15 | repeated targets at suspicious call depth |
| Liquidation correlation | 10 | liquidations landing in the same block as oracle updates |

| Score | Zone |
| --- | --- |
| 0–30 | allow |
| 31–60 | rate-limit (per-block volume cap from policy) |
| 61–100 | block (feeds the breaker FSM) |

## Repository layout

```
arbiguard/
├── contracts-stylus/    # Rust RiskEngine for Arbitrum Stylus (cargo stylus)
├── contracts/           # Foundry: firewall, registries, reference engine, tests
│   ├── src/ArbiGuardFirewall.sol        # hysteresis breaker FSM
│   ├── src/RiskPolicyRegistry.sol       # EIP-712 signed risk policies
│   ├── src/ReputationRegistry.sol       # ERC-8004-style agent gating
│   ├── src/ThreatSignatureRegistry.sol  # write-once shared threat intel
│   └── src/RiskEngineSolidity.sol       # reference scorer (non-Stylus chains)
├── skill/               # TypeScript detection engine, feature extraction, replays
├── server/ + arbiguard-ui/  # Express API + React chat agent (live URL above)
├── demo/firewall-demo.ts    # end-to-end exploit-replay demo
├── deployments/         # per-chain deployed addresses (JSON)
└── scripts/             # parity codegen, testnet deployment
```

## Run it

```bash
pnpm install

# all three scorers agree on the historical replays
pnpm test                                  # TS engine + parity + live integration
(cd contracts && forge test -vvv)          # firewall, policies, gating, registry, parity
(cd contracts-stylus && cargo test)        # Stylus engine parity
(cd contracts-stylus && cargo stylus check)

# deploy both testnets (needs funded DEPLOYER_PRIVATE_KEY in .env)
./scripts/deploy-testnets.sh

# replay the Radiant exploit against the deployed stack
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc CHAIN_ID=421614 pnpm demo:firewall
```

The demo replays the 2024 Radiant flash-loan exploit, scores it **on-chain** (73 → crosses the signed block threshold of 61), has the reputation-gated agent trip the breaker across two blocks, publishes the threat signature, and shows a second pool rejecting the same signature without ever being touched.

## Historical replays

| Replay | Date | Engine score | Outcome |
| --- | --- | ---: | --- |
| GMX oracle manipulation | 2022-09 | 63 | block |
| Camelot flash drain | 2023-03 | 30 | allow → flagged indicators |
| Radiant flash-loan exploit | 2024-01 | 73 | block → breaker trips |

## Stack

TypeScript · Viem · Express · React · Rust / Arbitrum Stylus · Solidity 0.8.28 · Foundry · OpenZeppelin · Vitest

## License

MIT — IBX Lab
