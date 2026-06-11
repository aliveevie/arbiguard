import { Router } from "express";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  http,
  keccak256,
  parseAbi,
  toBytes,
  type Hex,
} from "viem";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Deployed networks ───────────────────────────────────────────────────
const CHAINS = [
  {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpc:
      process.env.ARBITRUM_SEPOLIA_RPC_URL ??
      "https://sepolia-rollup.arbitrum.io/rpc",
    explorer: "https://arbitrum-sepolia.blockscout.com",
  },
  {
    chainId: 46630,
    name: "Robinhood Chain Testnet",
    rpc:
      process.env.ROBINHOOD_TESTNET_RPC_URL ??
      "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
  },
] as const;

const STATES = ["NORMAL", "ELEVATED", "TRIPPED", "COOLDOWN"] as const;

// Canonical replay feature vectors (see skill/detection/features.ts) and the
// scores the engines must reproduce — used to show on-chain parity live.
const REPLAYS = [
  { id: "radiant_flashloan_2024", expected: 73, features: [1n, 1150000n, 980000n, 0n, 4n, 0n, 1n, 1n] },
  { id: "gmx_oracle_manipulation_2022", expected: 63, features: [1n, 2410000n, 1870000n, 0n, 4n, 0n, 0n, 1n] },
  { id: "camelot_flash_drain_2023", expected: 30, features: [1n, 1520000n, 1480000n, 0n, 3n, 0n, 0n, 0n] },
];
const RADIANT_SIG = keccak256(toBytes("flash_loan_abuse:radiant_flashloan_2024"));

const firewallAbi = parseAbi([
  "function getPoolState(address pool) view returns ((bool registered, uint8 state, uint64 lastHighBlock, uint32 highBlockCount, uint64 trippedAtBlock, uint64 cooldownStartBlock, bytes32 tripSignature, uint16 tripScore))",
  "function isActionAllowed(address pool, bytes32 threatSignature) view returns (bool)",
  "function riskEngine() view returns (address)",
  "function minReputation() view returns (uint256)",
]);
const engineAbi = parseAbi([
  "function score(uint256[] features) view returns (uint256)",
]);
const policyAbi = parseAbi([
  "function getPolicy(address pool) view returns ((address pool, uint16 flagThreshold, uint16 blockThreshold, uint32 sustainBlocks, uint32 cooldownBlocks, uint256 maxVolumePerBlock, uint256 nonce, uint256 deadline))",
]);
const threatsAbi = parseAbi([
  "function threatCount() view returns (uint256)",
  "function signatures(uint256 i) view returns (bytes32)",
  "function getThreat(bytes32 signature) view returns ((bytes32 signature, uint8 threatType, uint16 score, address reporter, uint64 blockNumber, uint64 publishedAt))",
]);
const reputationAbi = parseAbi([
  "function agentIdOf(address agent) view returns (uint256)",
  "function reputationOf(uint256 agentId) view returns (uint256)",
]);

interface Deployment {
  chainId: number;
  reputationRegistry: Hex;
  riskPolicyRegistry: Hex;
  threatSignatureRegistry: Hex;
  riskEngineSolidity: Hex;
  riskEngine: Hex;
  firewall: Hex;
  agent: Hex;
  poolA: Hex;
  poolB: Hex;
}

function loadDeployment(chainId: number): Deployment | null {
  // Dev (tsx): server/../deployments. Prod: dist/server/../../deployments.
  for (const base of [join(__dirname, "..", ".."), join(__dirname, "..", "..", "..")]) {
    const file = join(base, "deployments", `${chainId}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  }
  return null;
}

async function readChain(chain: (typeof CHAINS)[number]) {
  const deployment = loadDeployment(chain.chainId);
  if (!deployment) return null;

  const client = createPublicClient({
    transport: http(chain.rpc, {
      timeout: 20_000,
      retryCount: 5,
      retryDelay: 500,
    }),
  });
  const read = <T>(address: Hex, abi: any, functionName: string, args?: any[]) =>
    client.readContract({ address, abi, functionName, args }) as Promise<T>;

  const pools = [
    { label: "RWA Pool Alpha", address: deployment.poolA },
    { label: "RWA Pool Beta", address: deployment.poolB },
  ];

  const [engineAddr, minReputation, agentId, threatCount, ...scores] =
    await Promise.all([
      read<Hex>(deployment.firewall, firewallAbi, "riskEngine"),
      read<bigint>(deployment.firewall, firewallAbi, "minReputation"),
      read<bigint>(deployment.reputationRegistry, reputationAbi, "agentIdOf", [deployment.agent]),
      read<bigint>(deployment.threatSignatureRegistry, threatsAbi, "threatCount"),
      ...REPLAYS.map((r) =>
        read<bigint>(deployment.riskEngine, engineAbi, "score", [r.features])
      ),
    ]);

  const reputation = await read<bigint>(
    deployment.reputationRegistry, reputationAbi, "reputationOf", [agentId]
  );

  const poolStates = await Promise.all(
    pools.map(async (p) => {
      const [state, allowedThreat, policy] = await Promise.all([
        read<any>(deployment.firewall, firewallAbi, "getPoolState", [p.address]),
        read<boolean>(deployment.firewall, firewallAbi, "isActionAllowed", [p.address, RADIANT_SIG]),
        read<any>(deployment.riskPolicyRegistry, policyAbi, "getPolicy", [p.address]),
      ]);
      return {
        ...p,
        state: STATES[state.state] ?? `UNKNOWN(${state.state})`,
        highBlockCount: Number(state.highBlockCount),
        tripScore: Number(state.tripScore),
        tripSignature: state.tripSignature,
        shieldedFromRadiantSignature: !allowedThreat,
        policy: {
          flagThreshold: policy.flagThreshold,
          blockThreshold: policy.blockThreshold,
          sustainBlocks: policy.sustainBlocks,
          cooldownBlocks: policy.cooldownBlocks,
        },
      };
    })
  );

  const count = Number(threatCount);
  const threatSigs = await Promise.all(
    Array.from({ length: Math.min(count, 10) }, (_, i) =>
      read<Hex>(deployment.threatSignatureRegistry, threatsAbi, "signatures", [BigInt(i)])
    )
  );
  const threats = await Promise.all(
    threatSigs.map(async (sig) => {
      const rec = await read<any>(deployment.threatSignatureRegistry, threatsAbi, "getThreat", [sig]);
      return {
        signature: rec.signature,
        threatType: Number(rec.threatType),
        score: Number(rec.score),
        reporter: rec.reporter,
        blockNumber: Number(rec.blockNumber),
        publishedAt: Number(rec.publishedAt),
      };
    })
  );

  return {
    chainId: chain.chainId,
    name: chain.name,
    explorer: chain.explorer,
    contracts: {
      firewall: deployment.firewall,
      riskEngine: deployment.riskEngine,
      riskEngineKind: deployment.riskEngine.toLowerCase() === deployment.riskEngineSolidity.toLowerCase()
        ? "solidity"
        : "stylus (Rust/WASM)",
      riskEngineLive: engineAddr,
      riskPolicyRegistry: deployment.riskPolicyRegistry,
      reputationRegistry: deployment.reputationRegistry,
      threatSignatureRegistry: deployment.threatSignatureRegistry,
    },
    engineParity: REPLAYS.map((r, i) => ({
      replay: r.id,
      expected: r.expected,
      onChain: Number(scores[i]),
      match: Number(scores[i]) === r.expected,
    })),
    agent: {
      address: deployment.agent,
      agentId: Number(agentId),
      reputation: Number(reputation),
      minReputation: Number(minReputation),
    },
    pools: poolStates,
    threatCount: count,
    threats,
  };
}

// ── Route with short-lived cache ────────────────────────────────────────
let cache: { at: number; payload: unknown } | null = null;
const CACHE_MS = 15_000;

const router = Router();

router.get("/", async (_req, res) => {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      res.json(cache.payload);
      return;
    }
    const chains = await Promise.all(
      CHAINS.map((c) =>
        readChain(c).catch((err) => ({
          chainId: c.chainId,
          name: c.name,
          error: String(err?.shortMessage ?? err?.message ?? err),
        }))
      )
    );
    const payload = { updatedAt: new Date().toISOString(), chains };
    cache = { at: Date.now(), payload };
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
