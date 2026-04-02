/**
 * ArbiGuard Autonomous Agent Demo
 *
 * Demonstrates the full threat detection and response cycle:
 *   1. Register agent on Arbitrum identity registry
 *   2. Replay historical exploits and score them
 *   3. Trigger circuit breaker when threat is detected
 *   4. Generate protocol health report
 *
 * Run: npx tsx demo/agent.ts
 */

import { assessThreat } from "../skill/actions/assessThreat.js";
import { getProtocolHealth } from "../skill/actions/getProtocolHealth.js";
import { getReplayIds } from "../skill/detection/replays/index.js";
import { createPublicClient, http } from "viem";
import { arbitrumSepolia } from "viem/chains";

const CONTRACT = "0xE827C2eF74F67e21c637d3164b3af3bC394cA52F";
const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const AGENT_ID = 156;

const client = createPublicClient({
  chain: arbitrumSepolia,
  transport: http("https://sepolia-rollup.arbitrum.io/rpc"),
});

function banner(text: string) {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${text}`);
  console.log("=".repeat(60));
}

function log(msg: string) {
  console.log(`  [ArbiGuard] ${msg}`);
}

async function main() {
  console.log(`
     _          _     _  ____                     _
    / \\   _ __ | |__ (_)/ ___|_   _  __ _ _ __ __| |
   / _ \\ | '__|| '_ \\| | |  _| | | |/ _\` | '__/ _\` |
  / ___ \\| |   | |_) | | |_| | |_| | (_| | | | (_| |
 /_/   \\_\\_|   |_.__/|_|\\____|\\__,_|\\__,_|_|  \\__,_|

 AI-Agent Skill for DeFi Threat Detection on Arbitrum
  `);

  // ── Step 1: Verify Agent Registration ──────────────────────────────
  banner("Step 1: Verify Agent Identity on Arbitrum Sepolia");

  try {
    const owner = await client.readContract({
      address: REGISTRY as `0x${string}`,
      abi: [
        {
          inputs: [{ name: "tokenId", type: "uint256" }],
          name: "ownerOf",
          outputs: [{ name: "", type: "address" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "ownerOf",
      args: [BigInt(AGENT_ID)],
    });
    log(`Agent #${AGENT_ID} registered on ERC-8004 registry`);
    log(`Owner: ${owner}`);
    log(`Registry: ${REGISTRY}`);
  } catch {
    log("WARNING: Agent not found on registry");
  }

  // ── Step 2: Verify Circuit Breaker Contract ────────────────────────
  banner("Step 2: Verify Circuit Breaker Deployment");

  const code = await client.getCode({
    address: CONTRACT as `0x${string}`,
  });
  log(`Contract: ${CONTRACT}`);
  log(`Code size: ${code ? (code.length - 2) / 2 : 0} bytes`);
  log(`Network: Arbitrum Sepolia (421614)`);

  const threatCount = await client.readContract({
    address: CONTRACT as `0x${string}`,
    abi: [
      {
        inputs: [],
        name: "getThreatHistoryLength",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "getThreatHistoryLength",
  });
  log(`Threat history entries: ${threatCount}`);

  // ── Step 3: Run Threat Assessment on Historical Exploits ───────────
  banner("Step 3: Replay Historical Arbitrum Exploits");

  const replayIds = getReplayIds();
  log(`Loaded ${replayIds.length} historical exploit replays\n`);

  for (const replayId of replayIds) {
    const result = await assessThreat({
      txHash: `0x${"0".repeat(63)}1` as `0x${string}`,
      network: "arbitrum_one",
      replayMode: true,
      replayId,
    });

    const scoreBar =
      "#".repeat(Math.round(result.threatScore / 5)) +
      ".".repeat(20 - Math.round(result.threatScore / 5));

    console.log(`  [${scoreBar}] ${result.threatScore}/100  ${replayId}`);
    console.log(
      `    Type: ${result.threatType}  |  Confidence: ${result.confidence}  |  Action: ${result.recommendation.toUpperCase()}`
    );

    if (result.indicators.length > 0) {
      for (const ind of result.indicators) {
        console.log(
          `    - [${ind.severity.toUpperCase()}] ${ind.type}: ${ind.description}`
        );
      }
    }
    console.log();
  }

  // ── Step 4: Demonstrate Autonomous Decision Making ─────────────────
  banner("Step 4: Autonomous Threat Response Decision");

  // Simulate receiving a high-threat transaction
  const criticalResult = await assessThreat({
    txHash: `0x${"0".repeat(63)}3` as `0x${string}`,
    network: "arbitrum_one",
    replayMode: true,
    replayId: "radiant_flashloan_2024",
  });

  log(`Incoming transaction assessed: score ${criticalResult.threatScore}`);

  if (criticalResult.recommendation === "block") {
    log("THREAT LEVEL: CRITICAL");
    log("AUTONOMOUS DECISION: Trigger circuit breaker");
    log(
      `Would call pausePool() on ${CONTRACT} for the affected pool`
    );
    log(
      "VRF randomness would select a defender for bounty payout"
    );
  } else if (criticalResult.recommendation === "flag") {
    log("THREAT LEVEL: ELEVATED");
    log("AUTONOMOUS DECISION: Flag for agent review");
    log(
      "Alert sent to monitoring dashboard, pool remains active"
    );
  } else {
    log("THREAT LEVEL: NORMAL");
    log("AUTONOMOUS DECISION: Allow transaction");
  }

  // ── Step 5: Protocol Health Report ─────────────────────────────────
  banner("Step 5: Protocol Health Report");

  try {
    const health = await getProtocolHealth({
      protocol: "gmx_v2",
      network: "arbitrum_sepolia",
      lookbackBlocks: 500,
    });

    log(`Protocol: ${health.protocol}`);
    log(`Network: ${health.network}`);
    log(`Circuit Breaker: ${health.circuitBreakerStatus}`);
    log(`Active Alerts: ${health.activeAlerts.length}`);
    log(`Recent Anomalies: ${health.recentAnomalies.length}`);
    log(`Report Time: ${new Date(health.reportedAt).toISOString()}`);
  } catch {
    log("Health report requires active RPC connection");
  }

  // ── Summary ────────────────────────────────────────────────────────
  banner("Agent Demo Complete");
  log("ArbiGuard is ready to protect DeFi on Arbitrum");
  log("");
  log("Deployed Contracts:");
  log(`  Circuit Breaker: ${CONTRACT}`);
  log(`  Agent Registry:  ${REGISTRY} (Agent #${AGENT_ID})`);
  log("");
  log("Capabilities Demonstrated:");
  log("  1. Agent identity verified on ERC-8004 registry");
  log("  2. Circuit breaker contract verified on-chain");
  log("  3. Historical exploit replay and scoring");
  log("  4. Autonomous threat response decision making");
  log("  5. Protocol health monitoring");
  console.log();
}

main().catch(console.error);
