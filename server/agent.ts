import "./loadEnv.js";
import { assessThreat } from "../skill/actions/assessThreat.js";
import { getProtocolHealth } from "../skill/actions/getProtocolHealth.js";
import { monitorPool, stopMonitoring } from "../skill/actions/monitorPool.js";
import { getReplayIds } from "../skill/detection/replays/index.js";
import { resolveWithOpenAI } from "./llm.js";
import { createPublicClient, http } from "viem";
import { arbitrumSepolia } from "viem/chains";
import type {
  ThreatAssessmentResult,
  ProtocolHealthReport,
  MonitorPoolResult,
  Network,
  Protocol,
} from "../skill/types/index.js";

// ── Constants ──────────────────────────────────────────────────────────
const CONTRACT = "0xE827C2eF74F67e21c637d3164b3af3bC394cA52F";
const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const AGENT_ID = 156;
const OWNER = "0x6563F945530132a0BacBFD772b79f127ef3Af339";

const client = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(
    process.env.ARBITRUM_SEPOLIA_RPC_URL ||
      "https://sepolia-rollup.arbitrum.io/rpc"
  ),
});

// ── Agent State ────────────────────────────────────────────────────────
const activeSessions: Map<string, MonitorPoolResult> = new Map();

// ── Intent Types ───────────────────────────────────────────────────────
export type Intent =
  | { type: "assess_threat"; txHash: string; network: Network; poolAddress?: string }
  | { type: "replay_exploit"; replayId: string }
  | { type: "list_replays" }
  | { type: "protocol_health"; protocol: Protocol; network: Network }
  | { type: "monitor_pool"; poolAddress: string; protocol: Protocol; network: Network }
  | { type: "stop_monitor"; sessionId: string }
  | { type: "contract_status" }
  | { type: "agent_info" }
  | { type: "help" }
  | { type: "pool_status"; poolAddress: string }
  | { type: "threat_history" }
  | { type: "unknown"; message: string };

// ── Intent Parser ──────────────────────────────────────────────────────
function parseIntent(message: string): Intent {
  const msg = message.toLowerCase().trim();
  const words = msg.split(/\s+/);

  // Extract hex addresses/hashes
  const hexMatch = message.match(/0x[a-fA-F0-9]{40,66}/g);
  const txHash = hexMatch?.find((h) => h.length === 66);
  const address = hexMatch?.find((h) => h.length === 42);

  // Detect protocol mentions
  const protocol: Protocol | null = msg.includes("gmx")
    ? "gmx_v2"
    : msg.includes("camelot")
      ? "camelot"
      : msg.includes("aave")
        ? "aave_v3"
        : null;

  // Detect network
  const network: Network = msg.includes("mainnet") || msg.includes("arbitrum one")
    ? "arbitrum_one"
    : "arbitrum_sepolia";

  // ── Replay exploits
  if (msg.includes("replay") || msg.includes("simulate") || msg.includes("demo exploit")) {
    const replayIds = getReplayIds();
    for (const id of replayIds) {
      const idWords = id.split("_");
      if (idWords.some((w) => msg.includes(w))) {
        return { type: "replay_exploit", replayId: id };
      }
    }
    // If they just say "replay" without specifying which
    if (msg.includes("all") || msg.includes("every")) {
      return { type: "list_replays" };
    }
    // Default to the most dramatic one
    if (msg.includes("replay") || msg.includes("demo")) {
      return { type: "list_replays" };
    }
  }

  // ── Assess threat
  if (
    (msg.includes("assess") || msg.includes("analyze") || msg.includes("scan") || msg.includes("check tx") || msg.includes("threat")) &&
    txHash
  ) {
    return { type: "assess_threat", txHash, network, poolAddress: address };
  }

  // ── Protocol health
  if (msg.includes("health") || msg.includes("status of") || msg.includes("how is")) {
    if (protocol) {
      return { type: "protocol_health", protocol, network };
    }
    // Default to gmx
    if (msg.includes("protocol") || msg.includes("defi")) {
      return { type: "protocol_health", protocol: "gmx_v2", network };
    }
  }

  // ── Monitor pool
  if ((msg.includes("monitor") || msg.includes("watch") || msg.includes("subscribe")) && address) {
    return {
      type: "monitor_pool",
      poolAddress: address,
      protocol: protocol || "gmx_v2",
      network,
    };
  }

  // ── Stop monitoring
  if (msg.includes("stop") && (msg.includes("monitor") || msg.includes("watch"))) {
    const sessionMatch = message.match(/[a-z_]+-0x[a-f0-9]+-\d+/i);
    return { type: "stop_monitor", sessionId: sessionMatch?.[0] || "" };
  }

  // ── Contract/agent status
  if (
    msg.includes("contract") ||
    msg.includes("deployed") ||
    msg.includes("circuit breaker") ||
    msg.includes("breaker status")
  ) {
    return { type: "contract_status" };
  }

  if (
    msg.includes("who are you") ||
    msg.includes("what are you") ||
    msg.includes("about") ||
    msg.includes("introduce") ||
    msg.includes("capabilities") ||
    msg.includes("what can you")
  ) {
    return { type: "agent_info" };
  }

  // ── Pool status
  if ((msg.includes("pool") || msg.includes("paused")) && address) {
    return { type: "pool_status", poolAddress: address };
  }

  // ── Threat history
  if (msg.includes("history") || msg.includes("past threats") || msg.includes("previous")) {
    return { type: "threat_history" };
  }

  // ── Help
  if (msg.includes("help") || msg.includes("commands") || msg === "?") {
    return { type: "help" };
  }

  // ── List replays on generic requests
  if (msg.includes("exploit") || msg.includes("attack") || msg.includes("hack")) {
    return { type: "list_replays" };
  }

  // ── Health check on generic protocol questions
  if (protocol) {
    return { type: "protocol_health", protocol, network };
  }

  return { type: "unknown", message: msg };
}

// ── Response Builders ──────────────────────────────────────────────────
function formatThreatResult(result: ThreatAssessmentResult): string {
  const emoji =
    result.recommendation === "block"
      ? "CRITICAL"
      : result.recommendation === "flag"
        ? "WARNING"
        : "CLEAR";

  let response = `**Threat Assessment — ${emoji}**\n\n`;
  response += `| Field | Value |\n|---|---|\n`;
  response += `| Transaction | \`${result.txHash.slice(0, 18)}...\` |\n`;
  response += `| Threat Score | **${result.threatScore}/100** |\n`;
  response += `| Threat Type | ${result.threatType || "None"} |\n`;
  response += `| Confidence | ${(result.confidence * 100).toFixed(0)}% |\n`;
  response += `| Recommendation | **${result.recommendation.toUpperCase()}** |\n\n`;

  if (result.indicators.length > 0) {
    response += `**Indicators Detected:**\n\n`;
    for (const ind of result.indicators) {
      const badge =
        ind.severity === "critical"
          ? "[CRITICAL]"
          : ind.severity === "high"
            ? "[HIGH]"
            : ind.severity === "medium"
              ? "[MEDIUM]"
              : "[LOW]";
      response += `- ${badge} **${ind.type}**: ${ind.description}\n`;
      response += `  - Evidence: \`${ind.onChainEvidence}\`\n`;
    }
  }

  if (result.recommendation === "block") {
    response += `\n**Autonomous Response:** Circuit breaker activation recommended. I would call \`pausePool()\` on the affected pool to halt operations until the threat is resolved.`;
  }

  return response;
}

function formatHealthReport(report: ProtocolHealthReport): string {
  let response = `**Protocol Health Report — ${report.protocol.toUpperCase()}**\n\n`;
  response += `| Field | Value |\n|---|---|\n`;
  response += `| Protocol | ${report.protocol} |\n`;
  response += `| Network | ${report.network} |\n`;
  response += `| Circuit Breaker | **${report.circuitBreakerStatus}** |\n`;
  response += `| Active Alerts | ${report.activeAlerts.length} |\n`;
  response += `| Recent Anomalies | ${report.recentAnomalies.length} |\n`;
  response += `| Report Time | ${new Date(report.reportedAt).toISOString()} |\n`;

  if (report.activeAlerts.length > 0) {
    response += `\n**Active Alerts:**\n`;
    for (const alert of report.activeAlerts) {
      response += `- [${alert.severity.toUpperCase()}] ${alert.message}\n`;
    }
  }

  if (report.recentAnomalies.length > 0) {
    response += `\n**Recent Anomalies:**\n`;
    for (const anomaly of report.recentAnomalies) {
      response += `- ${anomaly.type}: ${anomaly.description} (block ${anomaly.blockNumber})\n`;
    }
  }

  if (report.activeAlerts.length === 0 && report.recentAnomalies.length === 0) {
    response += `\nAll systems operating normally. No threats detected in the lookback window.`;
  }

  return response;
}

// ── Main Agent Handler ─────────────────────────────────────────────────
export async function handleAgentMessage(
  message: string
): Promise<{ response: string; action?: string; data?: unknown }> {
  let intent = parseIntent(message);

  if (intent.type === "unknown") {
    const llm = await resolveWithOpenAI(message);
    if (llm) {
      if ("markdown" in llm) {
        return {
          response: llm.markdown,
          action: "llm_chat",
        };
      }
      intent = llm.intent;
    }
  }

  switch (intent.type) {
    case "assess_threat": {
      try {
        const result = await assessThreat({
          txHash: intent.txHash as `0x${string}`,
          network: intent.network,
          poolAddress: intent.poolAddress as `0x${string}` | undefined,
        });
        return {
          response: formatThreatResult(result),
          action: "assess_threat",
          data: result,
        };
      } catch (error: any) {
        return {
          response: `Failed to assess transaction: ${error.message}. Make sure the transaction hash is valid and exists on ${intent.network}.`,
          action: "assess_threat_error",
        };
      }
    }

    case "replay_exploit": {
      const result = await assessThreat({
        txHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
        network: "arbitrum_one",
        replayMode: true,
        replayId: intent.replayId,
      });
      return {
        response:
          `**Replaying Historical Exploit: \`${intent.replayId}\`**\n\nRunning the transaction through ArbiGuard's detection engine...\n\n` +
          formatThreatResult(result),
        action: "replay_exploit",
        data: result,
      };
    }

    case "list_replays": {
      const ids = getReplayIds();
      let response =
        "**Available Historical Exploit Replays**\n\nI can replay these real Arbitrum exploits through the detection engine:\n\n";
      response += `| # | Replay ID | Event |\n|---|---|---|\n`;
      response += `| 1 | \`gmx_oracle_manipulation_2022\` | GMX oracle price manipulation (Sep 2022) |\n`;
      response += `| 2 | \`camelot_flash_drain_2023\` | Camelot flash loan pool drain (Mar 2023) |\n`;
      response += `| 3 | \`radiant_flashloan_2024\` | Radiant Capital flash loan exploit (Jan 2024) |\n\n`;
      response += `Try: *"replay the gmx exploit"* or *"simulate the radiant attack"*\n\n`;

      // Auto-run all replays for a quick demo
      response += `**Running all replays now...**\n\n`;
      for (const id of ids) {
        const result = await assessThreat({
          txHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
          network: "arbitrum_one",
          replayMode: true,
          replayId: id,
        });
        const bar =
          "\u2588".repeat(Math.round(result.threatScore / 5)) +
          "\u2591".repeat(20 - Math.round(result.threatScore / 5));
        const label =
          result.recommendation === "block"
            ? "BLOCK"
            : result.recommendation === "flag"
              ? "FLAG"
              : "ALLOW";
        response += `\`${bar}\` **${result.threatScore}/100** ${id} → **${label}**\n`;
      }

      return { response, action: "list_replays" };
    }

    case "protocol_health": {
      try {
        const report = await getProtocolHealth({
          protocol: intent.protocol,
          network: intent.network,
          lookbackBlocks: 500,
        });
        return {
          response: formatHealthReport(report),
          action: "protocol_health",
          data: report,
        };
      } catch (error: any) {
        return {
          response: `Failed to fetch health report: ${error.message}`,
          action: "health_error",
        };
      }
    }

    case "monitor_pool": {
      try {
        const result = await monitorPool({
          poolAddress: intent.poolAddress as `0x${string}`,
          protocol: intent.protocol,
          network: intent.network,
        });
        activeSessions.set(result.sessionId, result);
        return {
          response:
            `**Pool Monitoring Active**\n\n` +
            `| Field | Value |\n|---|---|\n` +
            `| Session ID | \`${result.sessionId}\` |\n` +
            `| Pool | \`${result.poolAddress}\` |\n` +
            `| Protocol | ${result.protocol} |\n` +
            `| Status | **${result.status}** |\n` +
            `| Events | ${result.subscribedEvents.length} event types |\n\n` +
            `I'm now monitoring this pool in real-time. Any suspicious transactions will be automatically assessed and flagged. Say *"stop monitoring"* to end the session.`,
          action: "monitor_pool",
          data: result,
        };
      } catch (error: any) {
        return {
          response: `Failed to start monitoring: ${error.message}`,
          action: "monitor_error",
        };
      }
    }

    case "stop_monitor": {
      if (intent.sessionId) {
        const stopped = stopMonitoring(intent.sessionId);
        return {
          response: stopped
            ? `Monitoring session \`${intent.sessionId}\` stopped.`
            : `No active session found with ID \`${intent.sessionId}\`.`,
          action: "stop_monitor",
        };
      }
      // Stop all
      let count = 0;
      for (const [id] of activeSessions) {
        stopMonitoring(id);
        count++;
      }
      activeSessions.clear();
      return {
        response:
          count > 0
            ? `Stopped ${count} monitoring session(s).`
            : `No active monitoring sessions to stop.`,
        action: "stop_monitor",
      };
    }

    case "contract_status": {
      try {
        const [code, threatCount, owner] = await Promise.all([
          client.getCode({ address: CONTRACT as `0x${string}` }),
          client.readContract({
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
          }),
          client.readContract({
            address: CONTRACT as `0x${string}`,
            abi: [
              {
                inputs: [],
                name: "owner",
                outputs: [{ name: "", type: "address" }],
                stateMutability: "view",
                type: "function",
              },
            ],
            functionName: "owner",
          }),
        ]);

        return {
          response:
            `**ArbiGuard Circuit Breaker — On-Chain Status**\n\n` +
            `| Field | Value |\n|---|---|\n` +
            `| Contract | \`${CONTRACT}\` |\n` +
            `| Network | Arbitrum Sepolia (421614) |\n` +
            `| Code Size | ${code ? (code.length - 2) / 2 : 0} bytes |\n` +
            `| Owner | \`${owner}\` |\n` +
            `| Threat History | ${threatCount} entries |\n` +
            `| VRF Coordinator | \`0x5CE8D5A2BC84beb22a398CCA51996F7930313D61\` |\n\n` +
            `The circuit breaker is **deployed and operational** on Arbitrum Sepolia.`,
          action: "contract_status",
        };
      } catch (error: any) {
        return {
          response: `Failed to query contract: ${error.message}`,
          action: "contract_error",
        };
      }
    }

    case "pool_status": {
      try {
        const config = await client.readContract({
          address: CONTRACT as `0x${string}`,
          abi: [
            {
              inputs: [{ name: "pool", type: "address" }],
              name: "getPoolConfig",
              outputs: [
                { name: "active", type: "bool" },
                { name: "paused", type: "bool" },
                { name: "maxVolumePerBlock", type: "uint256" },
                { name: "cooldownBlocks", type: "uint256" },
                { name: "lastTriggerBlock", type: "uint256" },
              ],
              stateMutability: "view",
              type: "function",
            },
          ],
          functionName: "getPoolConfig",
          args: [intent.poolAddress as `0x${string}`],
        });

        const [active, paused, maxVolume, cooldown, lastTrigger] = config;

        if (!active) {
          return {
            response: `Pool \`${intent.poolAddress}\` is **not registered** on the circuit breaker contract.`,
            action: "pool_status",
          };
        }

        return {
          response:
            `**Pool Status: \`${intent.poolAddress}\`**\n\n` +
            `| Field | Value |\n|---|---|\n` +
            `| Active | ${active ? "Yes" : "No"} |\n` +
            `| Paused | **${paused ? "YES — POOL IS PAUSED" : "No"}** |\n` +
            `| Max Volume/Block | ${maxVolume.toString()} wei |\n` +
            `| Cooldown Blocks | ${cooldown.toString()} |\n` +
            `| Last Trigger Block | ${lastTrigger.toString()} |\n`,
          action: "pool_status",
          data: { active, paused, maxVolume: maxVolume.toString(), cooldown: cooldown.toString() },
        };
      } catch (error: any) {
        return {
          response: `Failed to query pool status: ${error.message}`,
          action: "pool_error",
        };
      }
    }

    case "threat_history": {
      try {
        const count = await client.readContract({
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

        return {
          response:
            `**On-Chain Threat History**\n\n` +
            `The circuit breaker has recorded **${count} threat event(s)** on Arbitrum Sepolia.\n\n` +
            `Each entry represents a defensive action taken (pool pause or rate limit) in response to a detected threat.`,
          action: "threat_history",
          data: { count: count.toString() },
        };
      } catch (error: any) {
        return {
          response: `Failed to fetch threat history: ${error.message}`,
          action: "history_error",
        };
      }
    }

    case "agent_info": {
      return {
        response:
          `**I'm ArbiGuard — Agent #${AGENT_ID}**\n\n` +
          `I'm an autonomous AI agent specialized in real-time DeFi threat detection and protective response on Arbitrum.\n\n` +
          `**What I do:**\n` +
          `- Monitor DeFi pools for suspicious activity in real-time\n` +
          `- Score transactions against 5 attack indicators (flash loans, price manipulation, sandwich attacks, reentrancy, liquidation exploits)\n` +
          `- Autonomously trigger on-chain circuit breakers when threats are detected\n` +
          `- Generate protocol health reports\n\n` +
          `**My on-chain identity:**\n\n` +
          `| Field | Value |\n|---|---|\n` +
          `| Agent ID | #${AGENT_ID} (ERC-8004) |\n` +
          `| Registry | \`${REGISTRY}\` |\n` +
          `| Owner | \`${OWNER}\` |\n` +
          `| Circuit Breaker | \`${CONTRACT}\` |\n` +
          `| Network | Arbitrum Sepolia |\n\n` +
          `**Supported protocols:** GMX v2, Camelot DEX, Aave V3\n\n` +
          `Try asking me to *"replay the radiant exploit"* or *"check gmx health"*!`,
        action: "agent_info",
      };
    }

    case "help": {
      return {
        response:
          `**ArbiGuard Agent — Commands**\n\n` +
          `| Command | Example |\n|---|---|\n` +
          `| Assess a transaction | *"assess 0xabc123..."* |\n` +
          `| Replay an exploit | *"replay the gmx exploit"* |\n` +
          `| Show all replays | *"show me the exploits"* |\n` +
          `| Protocol health | *"how is gmx doing?"* |\n` +
          `| Monitor a pool | *"monitor pool 0xdead..."* |\n` +
          `| Stop monitoring | *"stop monitoring"* |\n` +
          `| Contract status | *"show circuit breaker status"* |\n` +
          `| Pool status | *"check pool 0xdead..."* |\n` +
          `| Threat history | *"show threat history"* |\n` +
          `| About me | *"who are you?"* |\n`,
        action: "help",
      };
    }

    case "unknown": {
      // Try to be helpful even with unknown queries
      const greetings = ["hi", "hello", "hey", "gm", "sup", "yo"];
      if (greetings.some((g) => intent.message.startsWith(g))) {
        return {
          response:
            `Hey! I'm **ArbiGuard**, your DeFi security agent on Arbitrum.\n\n` +
            `I can detect threats, replay historical exploits, and monitor pools in real-time. ` +
            `Try *"help"* to see what I can do, or jump right in with *"replay the radiant exploit"*!`,
          action: "greeting",
        };
      }

      return {
        response:
          `I'm not sure what you're asking. I'm ArbiGuard — I specialize in DeFi threat detection on Arbitrum.\n\n` +
          `Here are some things you can try:\n` +
          `- *"replay the gmx exploit"* — see me detect a real attack\n` +
          `- *"check gmx health"* — get a protocol health report\n` +
          `- *"show circuit breaker status"* — see the deployed contract\n` +
          `- *"help"* — see all commands\n`,
        action: "unknown",
      };
    }
  }
}
