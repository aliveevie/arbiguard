// ArbiGuard end-to-end firewall demo.
//
// Replays the Radiant Capital 2024 flash-loan exploit against the deployed
// stack and walks the full autonomous response:
//   1. replay → canonical feature vector
//   2. on-chain RiskEngine score (Stylus on Arbitrum) vs off-chain scorer
//   3. score crosses the EIP-712 signed block threshold
//   4. reputable agent reports through the hysteresis breaker → TRIPPED
//   5. threat signature published to the shared registry
//   6. a second registered pool is shielded from the same signature
//      with no transaction ever touching it
//
// Usage: RPC_URL=... CHAIN_ID=... AGENT_PRIVATE_KEY=... pnpm demo:firewall
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  toBytes,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { scoreThreat } from "../skill/detection/engine.js";
import { extractFeatures } from "../skill/detection/features.js";
import { getReplayInput, getReplayMetadata } from "../skill/detection/replays/index.js";

const REPLAY_ID = "radiant_flashloan_2024";
const STATES = ["NORMAL", "ELEVATED", "TRIPPED", "COOLDOWN"] as const;

const firewallAbi = parseAbi([
  "function assessAndReport(address pool, uint256[] features, bytes32 threatSignature) returns (uint256)",
  "function getPoolState(address pool) view returns ((bool registered, uint8 state, uint64 lastHighBlock, uint32 highBlockCount, uint64 trippedAtBlock, uint64 cooldownStartBlock, bytes32 tripSignature, uint16 tripScore))",
  "function isActionAllowed(address pool, bytes32 threatSignature) view returns (bool)",
  "function riskEngine() view returns (address)",
]);
const engineAbi = parseAbi([
  "function score(uint256[] features) view returns (uint256)",
  "function recommendation(uint256[] features) view returns (uint256)",
]);
const policyAbi = parseAbi([
  "function getPolicy(address pool) view returns ((address pool, uint16 flagThreshold, uint16 blockThreshold, uint32 sustainBlocks, uint32 cooldownBlocks, uint256 maxVolumePerBlock, uint256 nonce, uint256 deadline))",
]);
const threatsAbi = parseAbi([
  "function isKnownThreat(bytes32 signature) view returns (bool)",
  "function getThreat(bytes32 signature) view returns ((bytes32 signature, uint8 threatType, uint16 score, address reporter, uint64 blockNumber, uint64 publishedAt))",
]);

function banner(step: string) {
  console.log(`\n━━━ ${step} ${"━".repeat(Math.max(0, 64 - step.length))}`);
}

async function main() {
  const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8547";
  const chainId = process.env.CHAIN_ID ?? "31337";
  const agentKey = (process.env.AGENT_PRIVATE_KEY ??
    process.env.DEPLOYER_PRIVATE_KEY) as Hex;
  if (!agentKey) throw new Error("AGENT_PRIVATE_KEY not set");

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const deployment = JSON.parse(
    readFileSync(join(root, "deployments", `${chainId}.json`), "utf8")
  );
  const account = privateKeyToAccount(agentKey);
  const chain = {
    id: Number(chainId),
    name: `chain-${chainId}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const firewall = deployment.firewall as Hex;
  const poolA = deployment.poolA as Hex;
  const poolB = deployment.poolB as Hex;
  const threats = deployment.threatSignatureRegistry as Hex;
  const policies = deployment.riskPolicyRegistry as Hex;
  const engine = (await publicClient.readContract({
    address: firewall,
    abi: firewallAbi,
    functionName: "riskEngine",
  })) as Hex;

  console.log("ArbiGuard firewall demo");
  console.log(`  chain ${chainId} via ${rpcUrl}`);
  console.log(`  firewall ${firewall}`);
  console.log(`  risk engine ${engine}`);
  console.log(`  agent ${account.address}`);

  // ── 1. Replay the exploit off-chain ───────────────────────────────────
  banner("1/6 Radiant replay → feature extraction");
  const meta = getReplayMetadata(REPLAY_ID)!;
  const input = getReplayInput(REPLAY_ID)!;
  const offchain = scoreThreat(input);
  const features = extractFeatures(input);
  console.log(`replay: ${meta.name} (${meta.date}, ${meta.chain})`);
  console.log(`off-chain TypeScript score: ${offchain.score} (${offchain.threatType})`);
  console.log(`feature vector: [${features.join(", ")}]`);

  // ── 2. Score on-chain ─────────────────────────────────────────────────
  banner("2/6 On-chain RiskEngine score");
  const onchainScore = await publicClient.readContract({
    address: engine,
    abi: engineAbi,
    functionName: "score",
    args: [features],
  });
  console.log(`on-chain score: ${onchainScore}`);
  console.log(
    `parity with off-chain scorer: ${Number(onchainScore) === offchain.score ? "MATCH ✓" : "MISMATCH ✗"}`
  );
  if (Number(onchainScore) !== offchain.score) process.exit(1);

  // ── 3. Compare against the signed policy ──────────────────────────────
  banner("3/6 EIP-712 signed policy threshold");
  const policy = await publicClient.readContract({
    address: policies,
    abi: policyAbi,
    functionName: "getPolicy",
    args: [poolA],
  });
  console.log(
    `pool A policy: flag ≥ ${policy.flagThreshold}, block ≥ ${policy.blockThreshold}, sustain ${policy.sustainBlocks} blocks`
  );
  const crosses = Number(onchainScore) >= policy.blockThreshold;
  console.log(
    `score ${onchainScore} ${crosses ? "CROSSES" : "does not cross"} the signed block threshold (${policy.blockThreshold})`
  );
  if (!crosses) process.exit(1);

  // ── 4. Autonomous agent trips the breaker ─────────────────────────────
  banner("4/6 Agent reports through hysteresis breaker");
  const threatSig = keccak256(toBytes(`${offchain.threatType}:${REPLAY_ID}`));
  console.log(`threat signature: ${threatSig}`);

  const poolState = async (pool: Hex) =>
    publicClient.readContract({
      address: firewall,
      abi: firewallAbi,
      functionName: "getPoolState",
      args: [pool],
    });

  let state = (await poolState(poolA)).state;
  console.log(`pool A breaker state: ${STATES[state]}`);
  let lastBlock = 0n;
  for (let attempt = 1; state !== 2 && attempt <= 6; attempt++) {
    // hysteresis needs distinct blocks — wait for a new block between reports
    for (let i = 0; i < 60; i++) {
      const current = await publicClient.getBlockNumber({ cacheTime: 0 });
      if (current > lastBlock) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const hash = await walletClient.writeContract({
      address: firewall,
      abi: firewallAbi,
      functionName: "assessAndReport",
      args: [poolA, features, threatSig],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    lastBlock = receipt.blockNumber;
    state = (await poolState(poolA)).state;
    console.log(
      `report ${attempt}: block ${receipt.blockNumber} tx ${hash.slice(0, 18)}… → state ${STATES[state]}`
    );
  }
  if (state !== 2) {
    console.error("breaker did not trip");
    process.exit(1);
  }
  console.log("circuit breaker TRIPPED on-chain by the autonomous agent ✓");

  // ── 5. Threat signature published ─────────────────────────────────────
  banner("5/6 Shared threat registry");
  const known = await publicClient.readContract({
    address: threats,
    abi: threatsAbi,
    functionName: "isKnownThreat",
    args: [threatSig],
  });
  const record = await publicClient.readContract({
    address: threats,
    abi: threatsAbi,
    functionName: "getThreat",
    args: [threatSig],
  });
  console.log(`isKnownThreat(${threatSig.slice(0, 18)}…): ${known}`);
  console.log(
    `record: score ${record.score}, reporter ${record.reporter}, block ${record.blockNumber}`
  );
  if (!known) process.exit(1);

  // ── 6. Second pool protected with no extra action ─────────────────────
  banner("6/6 Cross-protocol shield for pool B");
  const stateB = await poolState(poolB);
  const allowedThreat = await publicClient.readContract({
    address: firewall,
    abi: firewallAbi,
    functionName: "isActionAllowed",
    args: [poolB, threatSig],
  });
  const allowedBenign = await publicClient.readContract({
    address: firewall,
    abi: firewallAbi,
    functionName: "isActionAllowed",
    args: [poolB, keccak256(toBytes("benign:transfer"))],
  });
  console.log(`pool B breaker state: ${STATES[stateB.state]} (never touched — no reports, no trip)`);
  console.log(`pool B isActionAllowed(radiant signature): ${allowedThreat} → BLOCKED by shared intel`);
  console.log(`pool B isActionAllowed(benign signature):  ${allowedBenign} → normal traffic unaffected`);

  const protectedNoAction = stateB.state === 0 && !allowedThreat && allowedBenign;
  console.log(
    `\nRESULT: second pool protected from the same signature with no extra action: ${protectedNoAction ? "PROVEN ✓" : "FAILED ✗"}`
  );
  process.exit(protectedNoAction ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
